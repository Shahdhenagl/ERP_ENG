<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemSerial;
use App\Models\StockMovement;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only thing that writes `item_serials`.
 *
 * A sub-ledger under StockLedger, not a rival to it: the quantity ledger stays
 * the authority on how many units there are, and this records which ones. The
 * rule tying the two together is that they must agree — five serials or none
 * on a receipt of five, never three.
 *
 * Serials arrive as free text off a label or a scanner, so they are trimmed and
 * compared case-insensitively. «AB-1234» and «ab-1234 » are the same battery,
 * and letting them be two is how a unit gets received twice and issued never.
 */
class SerialRegistry
{
    /**
     * Book serials in against a receipt.
     *
     * @param  array<int, string>  $serials
     * @return int how many were recorded
     */
    public function receive(
        Item $item,
        Warehouse $warehouse,
        array $serials,
        StockMovement $movement,
        float $qty,
    ): int {
        $clean = $this->normalise($serials);

        if ($clean === []) {
            $this->assertNotRequired($item, $qty);

            return 0;
        }

        $this->assertMatchesQty($clean, $qty);

        return DB::transaction(function () use ($item, $warehouse, $clean, $movement) {
            foreach ($clean as $serial) {
                $existing = $this->find($item, $serial);

                // Receiving a unit that is already on a shelf means one of the
                // two entries is wrong, and guessing which would be worse than
                // refusing. A unit that was issued and has come back is a
                // different matter — that is a legitimate second arrival.
                if ($existing && $existing->status === 'in_stock') {
                    throw ValidationException::withMessages([
                        'serials' => "الرقم التسلسلي «{$serial}» موجود بالفعل في المخزن.",
                    ]);
                }

                if ($existing) {
                    $existing->update([
                        'status' => 'in_stock',
                        'warehouse_id' => $warehouse->id,
                        'received_movement_id' => $movement->id,
                        'issued_movement_id' => null,
                    ]);

                    continue;
                }

                ItemSerial::create([
                    'item_id' => $item->id,
                    'serial' => $serial,
                    'status' => 'in_stock',
                    'warehouse_id' => $warehouse->id,
                    'received_movement_id' => $movement->id,
                ]);
            }

            return count($clean);
        });
    }

    /**
     * Mark serials as gone out on a job or a delivery.
     *
     * @param  array<int, string>  $serials
     */
    public function issue(Item $item, array $serials, StockMovement $movement, float $qty): int
    {
        $clean = $this->normalise($serials);

        if ($clean === []) {
            $this->assertNotRequired($item, $qty);

            return 0;
        }

        $this->assertMatchesQty($clean, $qty);

        return DB::transaction(function () use ($item, $clean, $movement) {
            foreach ($clean as $serial) {
                $unit = $this->find($item, $serial);

                if (! $unit) {
                    throw ValidationException::withMessages([
                        'serials' => "الرقم التسلسلي «{$serial}» غير مسجّل على هذا الصنف.",
                    ]);
                }

                // Issuing something already out is either a typo or a unit that
                // never came back. Both need a person, not a silent overwrite.
                if (! $unit->isAvailable()) {
                    throw ValidationException::withMessages([
                        'serials' => "الرقم التسلسلي «{$serial}» غير متاح ({$unit->statusLabel()}).",
                    ]);
                }

                $unit->update([
                    'status' => 'issued',
                    'warehouse_id' => null,
                    'issued_movement_id' => $movement->id,
                ]);
            }

            return count($clean);
        });
    }

    /**
     * A unit handed back by a customer.
     *
     * Landing as `returned` rather than `in_stock` on purpose: something that
     * has been out and come back deserves a look before it is sold again, and
     * a status that says so is the cheapest way to force that look.
     *
     * @param  array<int, string>  $serials
     */
    public function returnFromCustomer(
        Item $item,
        ?Warehouse $warehouse,
        array $serials,
        StockMovement $movement,
    ): int {
        $clean = $this->normalise($serials);

        return DB::transaction(function () use ($item, $warehouse, $clean, $movement) {
            foreach ($clean as $serial) {
                $unit = $this->find($item, $serial);

                if (! $unit) {
                    throw ValidationException::withMessages([
                        'serials' => "الرقم التسلسلي «{$serial}» غير مسجّل على هذا الصنف.",
                    ]);
                }

                $unit->update([
                    'status' => 'returned',
                    'warehouse_id' => $warehouse?->id,
                    'received_movement_id' => $movement->id,
                    'issued_movement_id' => null,
                ]);
            }

            return count($clean);
        });
    }

    /** Take a unit out of circulation for good. */
    public function scrap(ItemSerial $unit, ?string $reason = null): ItemSerial
    {
        $unit->update([
            'status' => 'scrapped',
            'warehouse_id' => null,
            'note' => $reason ?? $unit->note,
        ]);

        return $unit->fresh();
    }

    /* ── Internals ───────────────────────────────────────── */

    /**
     * Trim, drop the blanks, and refuse a list that repeats itself.
     *
     * @param  array<int, string>  $serials
     * @return array<int, string>
     */
    protected function normalise(array $serials): array
    {
        $clean = collect($serials)
            ->map(fn ($serial) => trim((string) $serial))
            ->filter()
            ->values();

        $duplicates = $clean->duplicates(fn ($serial) => mb_strtolower($serial));

        if ($duplicates->isNotEmpty()) {
            throw ValidationException::withMessages([
                'serials' => 'الرقم التسلسلي «'.$duplicates->first().'» مكرر في نفس العملية.',
            ]);
        }

        return $clean->all();
    }

    protected function find(Item $item, string $serial): ?ItemSerial
    {
        return ItemSerial::where('item_id', $item->id)
            ->whereRaw('LOWER(serial) = ?', [mb_strtolower($serial)])
            ->first();
    }

    /**
     * A tracked item cannot move without its serials, or the two ledgers stop
     * agreeing the moment anyone is in a hurry.
     */
    protected function assertNotRequired(Item $item, float $qty): void
    {
        if ($item->tracks_serials && $qty > 0) {
            throw ValidationException::withMessages([
                'serials' => "«{$item->name}» يتطلب أرقامًا تسلسلية.",
            ]);
        }
    }

    /** @param  array<int, string>  $serials */
    protected function assertMatchesQty(array $serials, float $qty): void
    {
        if (abs(count($serials) - $qty) > 0.0005) {
            throw ValidationException::withMessages([
                'serials' => 'عدد الأرقام التسلسلية ('.count($serials).') لا يساوي الكمية ('
                    .rtrim(rtrim(number_format($qty, 3, '.', ''), '0'), '.').').',
            ]);
        }
    }
}
