<?php

namespace App\Services;

use App\Models\Asset;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Quotation;
use App\Models\Supplier;
use App\Models\Task;
use BackedEnum;

/**
 * «التقارير المخصصة» — the raw rows of a dataset, handed over for whoever needs
 * a cut the fixed reports do not make.
 *
 * The fixed reports up in ReportService aggregate — sales by customer, stock
 * that has not moved. This does the opposite: it hands back the records
 * themselves, filtered to a window, so a manager can pivot them in the tool they
 * already use for exactly that. The list of what can be exported is a whitelist
 * in code, not an open query builder — a report nobody can read the query behind
 * is a report nobody can trust.
 */
class CustomReportService
{
    /** dataset key => label, in the order the picker shows them. */
    public const DATASETS = [
        'customers' => 'العملاء',
        'suppliers' => 'الموردون',
        'assets' => 'الأجهزة',
        'invoices' => 'الفواتير',
        'quotations' => 'عروض الأسعار',
        'tasks' => 'أوامر العمل',
        'employees' => 'الموظفون',
        'leads' => 'العملاء المحتملون',
    ];

    /** @return array<int, array{key: string, label: string}> */
    public static function catalogue(): array
    {
        return collect(self::DATASETS)
            ->map(fn (string $label, string $key) => ['key' => $key, 'label' => $label])
            ->values()
            ->all();
    }

    public static function exists(string $dataset): bool
    {
        return isset(self::DATASETS[$dataset]);
    }

    /**
     * The headings and rows for one dataset, filtered to a window.
     *
     * @return array{0: string, 1: array<int, string>, 2: iterable<int, array<int, mixed>>}
     */
    public function rows(string $dataset, ?string $from, ?string $to): array
    {
        $name = ($dataset).'-'.($from ?? 'all').'.csv';

        [$headings, $rows] = match ($dataset) {
            'customers' => $this->customers($from, $to),
            'suppliers' => $this->suppliers($from, $to),
            'assets' => $this->assets($from, $to),
            'invoices' => $this->invoices($from, $to),
            'quotations' => $this->quotations($from, $to),
            'tasks' => $this->tasks($from, $to),
            'employees' => $this->employees($from, $to),
            'leads' => $this->leads($from, $to),
            default => abort(404, 'مجموعة بيانات غير معروفة.'),
        };

        return [$name, $headings, $rows];
    }

    /* ── Datasets ────────────────────────────────────────── */

    /** @return array{0: array<int, string>, 1: iterable<int, array<int, mixed>>} */
    protected function customers(?string $from, ?string $to): array
    {
        return [
            ['الكود', 'الاسم', 'الشركة', 'النوع', 'الهاتف', 'أُضيف في'],
            $this->window(Customer::query(), 'created_at', $from, $to)->orderBy('id')->get()
                ->map(fn (Customer $c) => [
                    $c->code, $c->name, $c->company, $c->type, $c->phone,
                    $c->created_at?->toDateString(),
                ]),
        ];
    }

    /** @return array{0: array<int, string>, 1: iterable<int, array<int, mixed>>} */
    protected function suppliers(?string $from, ?string $to): array
    {
        return [
            ['الكود', 'الاسم', 'الشركة', 'الهاتف', 'أُضيف في'],
            $this->window(Supplier::query(), 'created_at', $from, $to)->orderBy('id')->get()
                ->map(fn (Supplier $s) => [
                    $s->code, $s->name, $s->company, $s->phone, $s->created_at?->toDateString(),
                ]),
        ];
    }

    /** @return array{0: array<int, string>, 1: iterable<int, array<int, mixed>>} */
    protected function assets(?string $from, ?string $to): array
    {
        return [
            ['الكود', 'السيريال', 'الماركة', 'الموديل', 'العميل', 'الحالة', 'أُضيف في'],
            $this->window(Asset::with('customer'), 'created_at', $from, $to)->orderBy('id')->get()
                ->map(fn (Asset $a) => [
                    $a->code, $a->serial, $a->brand, $a->model,
                    $a->customer?->name, $this->str($a->status), $a->created_at?->toDateString(),
                ]),
        ];
    }

    /** @return array{0: array<int, string>, 1: iterable<int, array<int, mixed>>} */
    protected function invoices(?string $from, ?string $to): array
    {
        return [
            ['الكود', 'العميل', 'التاريخ', 'الإجمالي', 'الحالة'],
            $this->window(Invoice::with('customer'), 'issue_date', $from, $to)->orderBy('id')->get()
                ->map(fn (Invoice $i) => [
                    $i->code, $i->customer?->name, $i->issue_date?->toDateString(),
                    (float) $i->total, $this->str($i->status),
                ]),
        ];
    }

    /** @return array{0: array<int, string>, 1: iterable<int, array<int, mixed>>} */
    protected function quotations(?string $from, ?string $to): array
    {
        return [
            ['الكود', 'العميل', 'العنوان', 'التاريخ', 'الإجمالي', 'الحالة'],
            $this->window(Quotation::with('customer'), 'issue_date', $from, $to)->orderBy('id')->get()
                ->map(fn (Quotation $q) => [
                    $q->code, $q->customer?->name, $q->title, $q->issue_date?->toDateString(),
                    (float) $q->total, $this->str($q->status),
                ]),
        ];
    }

    /** @return array{0: array<int, string>, 1: iterable<int, array<int, mixed>>} */
    protected function tasks(?string $from, ?string $to): array
    {
        return [
            ['الكود', 'العميل', 'الحالة', 'أُنشئ في'],
            $this->window(Task::with('customer'), 'created_at', $from, $to)->orderBy('id')->get()
                ->map(fn (Task $t) => [
                    $t->code, $t->customer?->name, $this->str($t->status),
                    $t->created_at?->toDateString(),
                ]),
        ];
    }

    /** @return array{0: array<int, string>, 1: iterable<int, array<int, mixed>>} */
    protected function employees(?string $from, ?string $to): array
    {
        return [
            ['الكود', 'الاسم', 'القسم', 'الوظيفة', 'الأساسي', 'الحالة', 'التعيين'],
            $this->window(Employee::query(), 'hired_on', $from, $to)->orderBy('id')->get()
                ->map(fn (Employee $e) => [
                    $e->code, $e->name, $e->department, $e->job_title,
                    (float) $e->basic_salary, $this->str($e->status), $e->hired_on?->toDateString(),
                ]),
        ];
    }

    /** @return array{0: array<int, string>, 1: iterable<int, array<int, mixed>>} */
    protected function leads(?string $from, ?string $to): array
    {
        return [
            ['الكود', 'الاسم', 'المصدر', 'الحالة', 'القيمة المتوقعة', 'أُضيف في'],
            $this->window(Lead::query(), 'created_at', $from, $to)->orderBy('id')->get()
                ->map(fn (Lead $l) => [
                    $l->code, $l->name, $this->str($l->source), $this->str($l->status),
                    (float) $l->est_value, $l->created_at?->toDateString(),
                ]),
        ];
    }

    /* ── Helpers ─────────────────────────────────────────── */

    /** Apply the date window to a query on the given column. */
    protected function window($query, string $column, ?string $from, ?string $to)
    {
        return $query
            ->when($from, fn ($q) => $q->whereDate($column, '>=', $from))
            ->when($to, fn ($q) => $q->whereDate($column, '<=', $to));
    }

    /** A backed enum prints as its value; anything else as itself. */
    protected function str(mixed $value): mixed
    {
        return $value instanceof BackedEnum ? $value->value : $value;
    }
}
