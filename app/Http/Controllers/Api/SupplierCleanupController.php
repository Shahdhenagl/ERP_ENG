<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseReturn;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * One-time, tightly scoped cleanup for the pre-live supplier fixture.
 *
 * This is intentionally not a generic supplier-delete endpoint. It refuses to
 * run if the production shape differs from the audited fixture or if any
 * accounting, treasury, stock, order, or cheque references exist.
 */
class SupplierCleanupController extends Controller
{
    private const SUPPLIER_ID = 1;

    private const SUPPLIER_CODE = 'SP-0001';

    private const SUPPLIER_NAME = 'احمد';

    private const PAYMENT_IDS = [1, 2, 3, 4, 5, 6, 7];

    private const INVOICE_IDS = [1, 2, 3, 4, 5, 6, 7];

    private const RETURN_IDS = [1];

    public function purgeExperimentalSupplier(Request $request): JsonResponse
    {
        $data = $request->validate([
            'confirmation' => ['required', 'in:DELETE-TEST-SUPPLIER-SP-0001'],
        ]);

        $supplier = Supplier::withTrashed()->find(self::SUPPLIER_ID);

        if (! $supplier) {
            return response()->json(['message' => 'المورد التجريبي غير موجود.'], 404);
        }

        if ($supplier->code !== self::SUPPLIER_CODE || $supplier->name !== self::SUPPLIER_NAME) {
            return response()->json([
                'message' => 'توقف التنظيف: بيانات المورد لا تطابق المورد التجريبي المراجع.',
            ], 422);
        }

        $payments = SupplierPayment::withTrashed()
            ->where('supplier_id', self::SUPPLIER_ID)
            ->get();
        $invoices = SupplierInvoice::withTrashed()
            ->where('supplier_id', self::SUPPLIER_ID)
            ->get();
        $returns = PurchaseReturn::withTrashed()
            ->where('supplier_id', self::SUPPLIER_ID)
            ->get();

        $paymentIds = $payments->pluck('id')->sort()->values()->all();
        $invoiceIds = $invoices->pluck('id')->sort()->values()->all();
        $returnIds = $returns->pluck('id')->sort()->values()->all();

        if ($paymentIds !== self::PAYMENT_IDS || $invoiceIds !== self::INVOICE_IDS || $returnIds !== self::RETURN_IDS) {
            return response()->json([
                'message' => 'توقف التنظيف: السجلات الحالية لا تطابق القائمة التجريبية المراجعة.',
                'found' => [
                    'payment_ids' => $paymentIds,
                    'invoice_ids' => $invoiceIds,
                    'return_ids' => $returnIds,
                ],
            ], 422);
        }

        $blocked = $this->findBlockingReferences($paymentIds, $invoiceIds, $returnIds);

        if ($blocked !== []) {
            return response()->json([
                'message' => 'توقف التنظيف: توجد مراجع مرتبطة، ولم يتم حذف أي سجل.',
                'blocked' => $blocked,
            ], 422);
        }

        $invoiceLineCount = DB::table('supplier_invoice_lines')
            ->whereIn('supplier_invoice_id', $invoices->pluck('id'))
            ->count();
        $returnLineCount = DB::table('purchase_return_lines')
            ->whereIn('purchase_return_id', $returns->pluck('id'))
            ->count();

        $deleted = DB::transaction(function () use ($supplier, $payments, $invoices, $returns, $invoiceLineCount, $returnLineCount): array {
            // Children first: all parent foreign keys remain valid until their
            // dependent rows have been removed.
            DB::table('supplier_invoice_lines')
                ->whereIn('supplier_invoice_id', $invoices->pluck('id'))
                ->delete();
            DB::table('purchase_return_lines')
                ->whereIn('purchase_return_id', $returns->pluck('id'))
                ->delete();

            $payments->each->forceDelete();
            $invoices->each->forceDelete();
            $returns->each->forceDelete();
            $supplier->forceDelete();

            return [
                'supplier' => 1,
                'supplier_payments' => $payments->count(),
                'supplier_invoices' => $invoices->count(),
                'supplier_invoice_lines' => $invoiceLineCount,
                'purchase_returns' => $returns->count(),
                'purchase_return_lines' => $returnLineCount,
            ];
        });

        return response()->json([
            'message' => 'تم تنظيف بيانات المورد التجريبي المحددة بنجاح.',
            'deleted' => $deleted,
        ]);
    }

    /** @return array<string, int> */
    private function findBlockingReferences(array $paymentIds, array $invoiceIds, array $returnIds): array
    {
        $blocks = [];

        $cashMovements = DB::table('cash_movements')
            ->where(function ($query) use ($paymentIds) {
                $query->whereIn('supplier_payment_id', $paymentIds)
                    ->orWhere(function ($nested) use ($paymentIds) {
                        $nested->where('source', 'supplier_payment')
                            ->where(function ($notes) use ($paymentIds) {
                                foreach ($paymentIds as $paymentId) {
                                    $notes->orWhere('note', 'like', "%PV-2026-" . str_pad((string) $paymentId, 4, '0', STR_PAD_LEFT) . "%");
                                }
                            });
                    });
            })
            ->count();

        if ($cashMovements > 0) {
            $blocks['cash_movements'] = $cashMovements;
        }

        $journalEntries = DB::table('journal_entries')
            ->where(function ($query) use ($paymentIds, $invoiceIds) {
                $query->where(function ($source) use ($invoiceIds) {
                    $source->where('sourceable_type', SupplierInvoice::class)
                        ->whereIn('sourceable_id', $invoiceIds);
                })->orWhere(function ($source) use ($paymentIds) {
                    $source->where('sourceable_type', SupplierPayment::class)
                        ->whereIn('sourceable_id', $paymentIds);
                });
            })
            ->count();

        if ($journalEntries > 0) {
            $blocks['journal_entries'] = $journalEntries;
        }

        $stockMovements = DB::table('stock_movements')
            ->where(function ($query) use ($invoiceIds, $returnIds) {
                $query->where('supplier_id', self::SUPPLIER_ID)
                    ->orWhereIn('supplier_invoice_id', $invoiceIds)
                    ->orWhereIn('purchase_return_id', $returnIds);
            })
            ->count();

        if ($stockMovements > 0) {
            $blocks['stock_movements'] = $stockMovements;
        }

        $purchaseOrders = DB::table('purchase_orders')
            ->where('supplier_id', self::SUPPLIER_ID)
            ->count();

        if ($purchaseOrders > 0) {
            $blocks['purchase_orders'] = $purchaseOrders;
        }

        $cheques = DB::table('cheques')
            ->where(function ($query) use ($paymentIds, $invoiceIds) {
                $query->where('supplier_id', self::SUPPLIER_ID)
                    ->orWhereIn('supplier_payment_id', $paymentIds)
                    ->orWhereIn('supplier_invoice_id', $invoiceIds);
            })
            ->count();

        if ($cheques > 0) {
            $blocks['cheques'] = $cheques;
        }

        $quotes = DB::table('supplier_quotes')
            ->where('supplier_id', self::SUPPLIER_ID)
            ->count();

        if ($quotes > 0) {
            $blocks['supplier_quotes'] = $quotes;
        }

        return $blocks;
    }
}

