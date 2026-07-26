<?php

namespace App\Http\Controllers\Api;

use App\Enums\ItemCategory;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Item;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Bulk import — the other half of the export. A CSV of customers or spare parts
 * becomes records, matched on a natural key so re-uploading the same file
 * updates rather than duplicates. Each kind carries the permission that guards
 * the module it writes to.
 *
 * The columns are the Arabic headers the template hands out, so what is exported
 * can be edited and imported straight back.
 */
class ImportController extends Controller
{
    /** segment => [headings, permission]. */
    protected const ENTITIES = [
        'customers' => [
            ['الاسم', 'الاسم بالإنجليزية', 'الهاتف', 'الشركة', 'النوع', 'البريد', 'البطاقة الضريبية', 'السجل التجاري', 'المدينة', 'العنوان'],
            'customers.manage',
        ],
        'items' => [
            ['الاسم', 'الكود', 'الفئة', 'الوحدة', 'حد الطلب'],
            'inventory.manage',
        ],
    ];

    /** The datasets a user may import, for the picker. */
    public function catalogue(): JsonResponse
    {
        return response()->json([
            'data' => [
                ['key' => 'customers', 'label' => 'العملاء'],
                ['key' => 'items', 'label' => 'الأصناف وقطع الغيار'],
            ],
        ]);
    }

    /** A blank CSV with just the headings — the format to fill and upload. */
    public function template(string $entity): StreamedResponse
    {
        [$headings] = $this->entity($entity);

        return response()->streamDownload(function () use ($headings) {
            $handle = fopen('php://output', 'w');
            fwrite($handle, "\xEF\xBB\xBF");   // BOM, so Excel reads the Arabic
            fputcsv($handle, $headings);
            fclose($handle);
        }, "{$entity}-template.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function store(Request $request, string $entity): JsonResponse
    {
        [, $permission] = $this->entity($entity);
        abort_unless($request->user()->hasPermission($permission), 403, 'ليس لديك صلاحية للاستيراد.');

        $request->validate(['file' => ['required', 'file', 'mimes:csv,txt', 'max:8192']]);

        $rows = $this->parse($request->file('file'));

        $result = $entity === 'customers'
            ? $this->importCustomers($rows)
            : $this->importItems($rows);

        return response()->json(['data' => $result]);
    }

    /* ── Importers ───────────────────────────────────────── */

    /** @param array<int, array<string, string>> $rows */
    protected function importCustomers(array $rows): array
    {
        $typeByLabel = array_flip(Customer::TYPES);   // label => key
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        foreach ($rows as $i => $row) {
            $get = fn (string $k) => ($row[$k] ?? '') ?: null;
            $name = $get('الاسم');

            if (! $name) {
                $skipped++;
                $errors[] = 'السطر '.($i + 2).': الاسم مطلوب.';
                continue;
            }

            $type = $get('النوع');
            $attrs = [
                'name' => $name,
                'name_en' => $get('الاسم بالإنجليزية'),
                'company' => $get('الشركة'),
                'type' => $type ? ($typeByLabel[$type] ?? (isset(Customer::TYPES[$type]) ? $type : null)) : null,
                'email' => $get('البريد'),
                'tax_id' => $get('البطاقة الضريبية'),
                'commercial_register' => $get('السجل التجاري'),
                'city' => $get('المدينة'),
                'address' => $get('العنوان'),
            ];

            $phone = $get('الهاتف');
            $existing = $phone ? Customer::where('phone', $phone)->first() : null;

            if ($existing) {
                $existing->update($attrs);
                $updated++;
            } else {
                Customer::create($attrs + ['phone' => $phone]);
                $created++;
            }
        }

        return $this->summary($created, $updated, $skipped, $errors);
    }

    /** @param array<int, array<string, string>> $rows */
    protected function importItems(array $rows): array
    {
        $catByLabel = collect(ItemCategory::cases())
            ->mapWithKeys(fn (ItemCategory $c) => [$c->label() => $c->value])
            ->all();

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        foreach ($rows as $i => $row) {
            $get = fn (string $k) => ($row[$k] ?? '') ?: null;
            $name = $get('الاسم');

            if (! $name) {
                $skipped++;
                $errors[] = 'السطر '.($i + 2).': الاسم مطلوب.';
                continue;
            }

            $cat = $get('الفئة');
            $attrs = [
                'name' => $name,
                'category' => $cat ? ($catByLabel[$cat] ?? (ItemCategory::tryFrom($cat)?->value ?? ItemCategory::SparePart->value)) : ItemCategory::SparePart->value,
                'unit' => $get('الوحدة') ?? 'قطعة',
                'reorder_level' => (float) ($get('حد الطلب') ?? 0),
            ];

            $code = $get('الكود');
            $existing = $code ? Item::where('code', $code)->first() : null;

            if ($existing) {
                $existing->update($attrs);
                $updated++;
            } else {
                Item::create($attrs + ($code ? ['code' => $code] : []));
                $created++;
            }
        }

        return $this->summary($created, $updated, $skipped, $errors);
    }

    /* ── Internals ───────────────────────────────────────── */

    /** @return array{0: array<int, string>, 1: string} */
    protected function entity(string $entity): array
    {
        abort_unless(isset(self::ENTITIES[$entity]), 404, 'مجموعة بيانات غير معروفة.');

        return self::ENTITIES[$entity];
    }

    /**
     * Read the CSV into rows keyed by the heading row.
     *
     * @return array<int, array<string, string>>
     */
    protected function parse(UploadedFile $file): array
    {
        $handle = fopen($file->getRealPath(), 'r');
        $headers = null;
        $rows = [];

        while (($data = fgetcsv($handle)) !== false) {
            if ($headers === null) {
                // Strip the byte-order mark Excel writes on the first cell.
                $data[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $data[0]);
                $headers = array_map(fn ($h) => trim((string) $h), $data);
                continue;
            }

            if (count(array_filter($data, fn ($c) => trim((string) $c) !== '')) === 0) {
                continue;   // a blank line
            }

            $row = [];
            foreach ($headers as $index => $heading) {
                $row[$heading] = isset($data[$index]) ? trim((string) $data[$index]) : '';
            }
            $rows[] = $row;
        }

        fclose($handle);

        return $rows;
    }

    /** @return array<string, mixed> */
    protected function summary(int $created, int $updated, int $skipped, array $errors): array
    {
        return [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors' => array_slice($errors, 0, 20),
        ];
    }
}
