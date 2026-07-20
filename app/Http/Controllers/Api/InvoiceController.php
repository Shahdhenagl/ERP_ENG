<?php

namespace App\Http\Controllers\Api;

use App\Enums\InvoiceStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\InvoiceResource;
use App\Models\ActivityLog;
use App\Models\Invoice;
use App\Models\Task;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class InvoiceController extends Controller
{
    public function __construct(protected BillingService $billing) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $invoices = Invoice::query()
            ->search($request->string('search')->toString())
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('outstanding'), fn ($q) => $q->outstanding())
            ->when($request->boolean('overdue'), fn ($q) => $q->overdue())
            ->with(['customer', 'payments'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 25));

        return InvoiceResource::collection($invoices);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'due_date' => ['nullable', 'date'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'customer_tax_id' => ['nullable', 'string', 'max:32'],
            'notes' => ['nullable', 'string', 'max:2000'],

            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['required', 'string', 'max:300'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        $invoice = Invoice::create([
            ...collect($data)->except('lines')->all(),
            'created_by' => $request->user()->id,
        ]);

        $this->syncLines($invoice, $data['lines']);
        $invoice = $this->billing->recalculate($invoice);

        ActivityLog::record('invoice.created', $invoice, "تم إنشاء الفاتورة {$invoice->code}");

        return response()->json(new InvoiceResource($invoice->load(['customer', 'lines'])), 201);
    }

    public function show(Invoice $invoice): InvoiceResource
    {
        return new InvoiceResource(
            $invoice->load(['customer', 'task', 'lines.item', 'payments.box', 'payments.actor']),
        );
    }

    public function update(Request $request, Invoice $invoice): JsonResponse
    {
        // Past draft the customer has seen the document; it is corrected with a
        // void and a fresh invoice, not by quietly rewriting the numbers.
        if ($invoice->status !== InvoiceStatus::Draft) {
            return response()->json([
                'message' => 'لا يمكن تعديل فاتورة صادرة. ألغِها وأصدر فاتورة جديدة.',
            ], 422);
        }

        $data = $request->validate([
            'due_date' => ['nullable', 'date'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'customer_tax_id' => ['nullable', 'string', 'max:32'],
            'notes' => ['nullable', 'string', 'max:2000'],

            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['nullable', 'exists:items,id'],
            'lines.*.description' => ['required', 'string', 'max:300'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        $invoice->update(collect($data)->except('lines')->all());
        $this->syncLines($invoice, $data['lines']);
        $invoice = $this->billing->recalculate($invoice);

        return response()->json(new InvoiceResource($invoice->load(['customer', 'lines'])));
    }

    public function issue(Invoice $invoice): InvoiceResource
    {
        $issued = $this->billing->issue($invoice);

        ActivityLog::record('invoice.issued', $issued, "تم إصدار الفاتورة {$issued->code}");

        return new InvoiceResource($issued->load(['customer', 'lines', 'payments']));
    }

    public function void(Request $request, Invoice $invoice): InvoiceResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $voided = $this->billing->void($invoice, $data['reason']);

        ActivityLog::record('invoice.voided', $voided, "تم إلغاء الفاتورة {$voided->code}");

        return new InvoiceResource($voided->load(['customer', 'lines']));
    }

    /** Draft an invoice for a finished job from the parts it consumed. */
    public function fromTask(Request $request, Task $task): JsonResponse
    {
        $data = $request->validate(['tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100']]);

        $invoice = $this->billing->draftFromTask($task, $request->user(), (float) ($data['tax_rate'] ?? 0));

        ActivityLog::record('invoice.created', $invoice, "تم إنشاء الفاتورة {$invoice->code} من {$task->code}");

        return response()->json(new InvoiceResource($invoice->load(['customer', 'lines'])), 201);
    }

    public function destroy(Invoice $invoice): JsonResponse
    {
        if ($invoice->status !== InvoiceStatus::Draft) {
            return response()->json([
                'message' => 'لا يمكن حذف فاتورة صادرة. استخدم الإلغاء بدلًا من ذلك.',
            ], 422);
        }

        $code = $invoice->code;
        $invoice->delete();

        ActivityLog::record('invoice.deleted', $invoice, "تم حذف المسودة {$code}");

        return response()->json(['message' => 'تم حذف المسودة.']);
    }

    /** Replace every line in one go — simpler than diffing, and drafts are cheap. */
    protected function syncLines(Invoice $invoice, array $lines): void
    {
        $invoice->lines()->delete();

        foreach (array_values($lines) as $sort => $line) {
            $qty = (float) $line['qty'];
            $price = (float) $line['unit_price'];

            $invoice->lines()->create([
                'item_id' => $line['item_id'] ?? null,
                'description' => $line['description'],
                'qty' => $qty,
                'unit_price' => $price,
                'line_total' => round($qty * $price, 2),
                'sort' => $sort,
            ]);
        }
    }
}
