<?php

namespace App\Services;

use App\Models\CashBox;
use App\Models\CashMovement;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The buying side: orders placed, goods booked in against them, and money paid
 * out to suppliers.
 *
 * Stock itself is still only ever written by StockLedger — this adds the
 * paperwork around a receipt rather than a second way to move a balance.
 */
class PurchasingService
{
    public function __construct(protected StockLedger $ledger) {}

    /** Send a draft to the supplier. Past this it can be received against. */
    public function send(PurchaseOrder $order): PurchaseOrder
    {
        if ($order->status !== 'draft') {
            throw ValidationException::withMessages([
                'status' => 'أمر الشراء ليس مسودة.',
            ]);
        }

        if ($order->lines()->count() === 0) {
            throw ValidationException::withMessages([
                'lines' => 'لا يمكن إرسال أمر شراء بدون أصناف.',
            ]);
        }

        $order->forceFill(['status' => 'sent'])->save();

        return $order->fresh();
    }

    /**
     * Cancel an order. Refused once anything has arrived against it — the
     * receipt would be left pointing at an order that no longer counts.
     */
    public function cancel(PurchaseOrder $order, string $reason): PurchaseOrder
    {
        if ($order->receipts()->exists()) {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن إلغاء أمر شراء تم استلام جزء منه.',
            ]);
        }

        $order->forceFill(['status' => 'cancelled', 'cancel_reason' => $reason])->save();

        return $order->fresh();
    }

    /**
     * Book goods in against an order.
     *
     * Receiving more than was ordered is refused rather than absorbed: an extra
     * quantity nobody asked for is either a delivery error or a keying error,
     * and letting it through silently is how a stock balance stops matching the
     * shelf. Receiving *less* is normal and leaves the line outstanding.
     *
     * @param  array<int, array{item_id: int, qty: float, unit_cost?: float|null}>  $lines
     * @return array<int, StockMovement>
     */
    public function receiveAgainstOrder(
        PurchaseOrder $order,
        array $lines,
        User $actor,
        array $context = [],
    ): array {
        if ($order->status !== 'sent') {
            throw ValidationException::withMessages([
                'status' => 'لا يمكن الاستلام إلا على أمر شراء مُرسَل.',
            ]);
        }

        $warehouse = Warehouse::main();
        $movements = [];

        // Validated up front so a bad line cannot leave half the delivery booked.
        foreach ($lines as $line) {
            $qty = round((float) ($line['qty'] ?? 0), 3);

            if ($qty <= 0) {
                continue;
            }

            $orderLine = $order->lines()->where('item_id', $line['item_id'])->first();

            if (! $orderLine) {
                throw ValidationException::withMessages([
                    'lines' => 'صنف غير موجود في أمر الشراء.',
                ]);
            }

            $outstanding = $order->outstandingFor((int) $line['item_id']);

            if ($qty > $outstanding + 0.0005) {
                $item = Item::find($line['item_id']);

                throw ValidationException::withMessages([
                    'lines' => "المتبقي من «{$item?->name}» على أمر الشراء هو {$outstanding} فقط.",
                ]);
            }
        }

        DB::transaction(function () use ($order, $lines, $actor, $context, $warehouse, &$movements) {
            foreach ($lines as $line) {
                $qty = round((float) ($line['qty'] ?? 0), 3);

                if ($qty <= 0) {
                    continue;
                }

                $item = Item::findOrFail($line['item_id']);
                $orderLine = $order->lines()->where('item_id', $item->id)->first();

                // The ordered price is the default, but what actually got
                // invoiced wins — that is the number the average must move on.
                $unitCost = isset($line['unit_cost']) && $line['unit_cost'] !== null
                    ? (float) $line['unit_cost']
                    : (float) $orderLine->unit_price;

                $movements[] = $this->ledger->receive($item, $warehouse, $qty, $unitCost, $actor, [
                    'supplier_id' => $order->supplier_id,
                    'purchase_order_id' => $order->id,
                    'supplier' => $order->supplier->name,
                    'reference' => $context['reference'] ?? null,
                    'note' => $context['note'] ?? null,
                ]);
            }
        });

        return $movements;
    }

    /** Goods arriving with no order behind them — still tied to a supplier. */
    public function receiveDirect(
        Supplier $supplier,
        Item $item,
        float $qty,
        float $unitCost,
        User $actor,
        array $context = [],
    ): StockMovement {
        return $this->ledger->receive($item, Warehouse::main(), $qty, $unitCost, $actor, [
            ...$context,
            'supplier_id' => $supplier->id,
            'supplier' => $supplier->name,
        ]);
    }

    /**
     * Pay a supplier. Writes the voucher and the cash movement together, so the
     * treasury can never disagree with the vouchers behind it.
     */
    public function paySupplier(array $data, User $actor): SupplierPayment
    {
        $amount = round((float) $data['amount'], 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount' => 'المبلغ يجب أن يكون أكبر من صفر.',
            ]);
        }

        $supplier = Supplier::findOrFail($data['supplier_id']);

        $box = ! empty($data['cash_box_id'])
            ? CashBox::findOrFail($data['cash_box_id'])
            : CashBox::default();

        if ($amount > $box->balance() + 0.005) {
            throw ValidationException::withMessages([
                'amount' => 'رصيد «'.$box->name.'» لا يكفي ('.number_format($box->balance(), 2).').',
            ]);
        }

        // Paying beyond what is owed is allowed — an advance to a supplier is a
        // real thing — but it is worth surfacing rather than hiding.
        return DB::transaction(function () use ($data, $amount, $supplier, $box, $actor) {
            $payment = SupplierPayment::create([
                'supplier_id' => $supplier->id,
                'cash_box_id' => $box->id,
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'paid_at' => $data['paid_at'] ?? now()->toDateString(),
                'reference' => $data['reference'] ?? null,
                'note' => $data['note'] ?? null,
                'user_id' => $actor->id,
            ]);

            CashMovement::create([
                'cash_box_id' => $box->id,
                'direction' => 'out',
                'amount' => $amount,
                'source' => 'supplier_payment',
                'supplier_payment_id' => $payment->id,
                'note' => "{$payment->code} — {$supplier->name}",
                'user_id' => $actor->id,
            ]);

            return $payment;
        });
    }

    /** Reverse a voucher. Both lines stay in the ledger; nothing is erased. */
    public function reversePayment(SupplierPayment $payment, User $actor): void
    {
        DB::transaction(function () use ($payment, $actor) {
            CashMovement::create([
                'cash_box_id' => $payment->cash_box_id,
                'direction' => 'in',
                'amount' => $payment->amount,
                'source' => 'supplier_payment',
                'supplier_payment_id' => $payment->id,
                'note' => "إلغاء سند الصرف {$payment->code}",
                'user_id' => $actor->id,
            ]);

            $payment->delete();
        });
    }

    /** Total still owed across every supplier. */
    public function totalPayable(): float
    {
        return round(
            Supplier::query()->get()->sum(fn (Supplier $s) => max($s->balance(), 0)),
            2,
        );
    }
}
