<?php

namespace App\Http\Controllers\Api;

use App\Enums\AccountType;
use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\ActivityLog;
use App\Models\CostCenter;
use App\Models\JournalEntry;
use App\Services\ChartOfAccounts;
use App\Services\FinancialReports;
use App\Services\Ledger;
use App\Services\LedgerBackfill;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AccountingController extends Controller
{
    public function __construct(
        protected ChartOfAccounts $chart,
        protected Ledger $ledger,
        protected FinancialReports $reports,
        protected LedgerBackfill $backfill,
    ) {}

    /* ── Chart of accounts ───────────────────────────────── */

    /**
     * The whole chart, flat, each row carrying its depth.
     *
     * Flat rather than nested: the screen renders one indented list, and a tree
     * of objects would have to be walked back into exactly that. Balances are
     * summed once for every account and rolled up to the headings, so a group
     * shows the total of what sits under it.
     */
    public function accounts(Request $request): JsonResponse
    {
        $this->chart->ensure();

        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $accounts = Account::query()
            ->search($request->string('search')->toString() ?: null)
            ->orderBy('code')
            ->get();

        $balances = $this->balancesFor($accounts, $filters['from'] ?? null, $filters['to'] ?? null);
        $depths = $this->depths($accounts);

        return response()->json([
            'data' => $accounts->map(fn (Account $account) => [
                'id' => $account->id,
                'code' => $account->code,
                'name' => $account->name,
                'type' => $account->type->value,
                'type_label' => $account->type->label(),
                'parent_id' => $account->parent_id,
                'is_group' => $account->is_group,
                'is_system' => $account->is_system,
                'is_active' => $account->is_active,
                'key' => $account->key,
                'notes' => $account->notes,
                'depth' => $depths[$account->id] ?? 0,
                'balance' => $balances[$account->id] ?? 0.0,
            ])->values(),
        ]);
    }

    public function storeAccount(Request $request): JsonResponse
    {
        $this->chart->ensure();

        $data = $request->validate([
            'code' => ['required', 'string', 'max:16', 'unique:accounts,code'],
            'name' => ['required', 'string', 'max:160'],
            'type' => ['required', Rule::enum(AccountType::class)],
            'parent_id' => ['nullable', 'exists:accounts,id'],
            'is_group' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $this->assertParentAgrees($data);

        $account = Account::create([...$data, 'is_system' => false]);

        ActivityLog::record('account.created', $account, "حساب جديد {$account->code} — {$account->name}");

        return response()->json(['data' => ['id' => $account->id]], 201);
    }

    public function updateAccount(Request $request, Account $account): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:16', Rule::unique('accounts', 'code')->ignore($account->id)],
            'name' => ['required', 'string', 'max:160'],
            'type' => ['required', Rule::enum(AccountType::class)],
            'parent_id' => ['nullable', 'exists:accounts,id'],
            'is_group' => ['boolean'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        if ((int) ($data['parent_id'] ?? 0) === $account->id) {
            throw ValidationException::withMessages(['parent_id' => 'لا يمكن أن يكون الحساب أبًا لنفسه.']);
        }

        // Turning a posted-to account into a heading would strand its entries
        // somewhere nothing is allowed to be.
        if (($data['is_group'] ?? false) && $account->lines()->exists()) {
            throw ValidationException::withMessages([
                'is_group' => 'الحساب عليه حركة، فلا يمكن تحويله إلى حساب تجميعي.',
            ]);
        }

        // A seeded account may be renamed and moved — that is the point of the
        // machine key — but its type is what the posting rules assume.
        if ($account->is_system && $data['type'] !== $account->type->value) {
            throw ValidationException::withMessages([
                'type' => 'لا يمكن تغيير نوع حساب أساسي يعتمد عليه النظام.',
            ]);
        }

        $this->assertParentAgrees($data);

        $account->update($data);

        return response()->json(['data' => ['id' => $account->id]]);
    }

    public function destroyAccount(Account $account): JsonResponse
    {
        if ($account->is_system) {
            throw ValidationException::withMessages([
                'account' => 'حساب أساسي يعتمد عليه الترحيل الآلي — يمكن إعادة تسميته أو تعطيله فقط.',
            ]);
        }

        if ($account->lines()->exists()) {
            throw ValidationException::withMessages([
                'account' => 'الحساب عليه حركة. عطّله بدلًا من حذفه.',
            ]);
        }

        if ($account->children()->exists()) {
            throw ValidationException::withMessages([
                'account' => 'احذف الحسابات الفرعية أولًا.',
            ]);
        }

        $account->delete();

        return response()->json(['message' => 'تم حذف الحساب.']);
    }

    /* ── Cost centres ────────────────────────────────────── */

    public function costCenters(Request $request): JsonResponse
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);

        return response()->json([
            'data' => $this->reports->costCentres($filters['from'] ?? null, $filters['to'] ?? null),
        ]);
    }

    public function storeCostCenter(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['nullable', 'string', 'max:16', 'unique:cost_centers,code'],
            'name' => ['required', 'string', 'max:160'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $centre = CostCenter::create($data);

        return response()->json(['data' => ['id' => $centre->id, 'code' => $centre->code]], 201);
    }

    public function updateCostCenter(Request $request, CostCenter $costCenter): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:16', Rule::unique('cost_centers', 'code')->ignore($costCenter->id)],
            'name' => ['required', 'string', 'max:160'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $costCenter->update($data);

        return response()->json(['data' => ['id' => $costCenter->id]]);
    }

    public function destroyCostCenter(CostCenter $costCenter): JsonResponse
    {
        if ($costCenter->lines()->exists()) {
            throw ValidationException::withMessages([
                'cost_center' => 'مركز التكلفة عليه حركة. عطّله بدلًا من حذفه.',
            ]);
        }

        $costCenter->delete();

        return response()->json(['message' => 'تم حذف مركز التكلفة.']);
    }

    /* ── The journal ─────────────────────────────────────── */

    public function entries(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'account_id' => ['nullable', 'exists:accounts,id'],
        ]);

        $entries = JournalEntry::query()
            ->search($request->string('search')->toString() ?: null)
            ->when($request->string('source')->toString(), fn ($q, $s) => $q->where('source', $s))
            ->when($request->date('from'), fn ($q, $from) => $q->whereDate('entry_date', '>=', $from))
            ->when($request->date('to'), fn ($q, $to) => $q->whereDate('entry_date', '<=', $to))
            ->when($request->integer('account_id'), fn ($q, $id) => $q
                ->whereHas('lines', fn ($l) => $l->where('account_id', $id)))
            ->when(! $request->boolean('include_void'), fn ($q) => $q->live())
            ->with(['lines.account', 'creator'])
            ->orderByDesc('entry_date')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'data' => $entries->through(fn (JournalEntry $entry) => $this->entryPayload($entry))->items(),
            'meta' => ['total' => $entries->total(), 'last_page' => $entries->lastPage()],
        ]);
    }

    public function entry(JournalEntry $entry): JsonResponse
    {
        return response()->json([
            'data' => $this->entryPayload($entry->load(['lines.account', 'lines.costCenter', 'creator', 'reverses'])),
        ]);
    }

    /** A hand-written entry — the one thing in the journal nobody's document caused. */
    public function storeEntry(Request $request): JsonResponse
    {
        $this->chart->ensure();

        $data = $request->validate([
            'entry_date' => ['required', 'date'],
            'memo' => ['nullable', 'string', 'max:255'],
            'lines' => ['required', 'array', 'min:2'],
            'lines.*.account_id' => ['required', 'exists:accounts,id'],
            'lines.*.cost_center_id' => ['nullable', 'exists:cost_centers,id'],
            'lines.*.debit' => ['nullable', 'numeric', 'min:0'],
            'lines.*.credit' => ['nullable', 'numeric', 'min:0'],
            'lines.*.memo' => ['nullable', 'string', 'max:255'],
        ]);

        $entry = $this->ledger->post(
            array_map(fn (array $line) => [
                'account' => (int) $line['account_id'],
                'cost_center_id' => $line['cost_center_id'] ?? null,
                'debit' => (float) ($line['debit'] ?? 0),
                'credit' => (float) ($line['credit'] ?? 0),
                'memo' => $line['memo'] ?? null,
            ], $data['lines']),
            [
                'entry_date' => $data['entry_date'],
                'memo' => $data['memo'] ?? null,
                'source' => 'manual',
            ],
            $request->user(),
        );

        ActivityLog::record('journal.posted', $entry, "قيد يدوي {$entry->code} بقيمة ".number_format((float) $entry->total, 2));

        return response()->json(['data' => $this->entryPayload($entry->load('lines.account'))], 201);
    }

    public function reverseEntry(Request $request, JournalEntry $entry): JsonResponse
    {
        $data = $request->validate([
            'memo' => ['nullable', 'string', 'max:255'],
            'entry_date' => ['nullable', 'date'],
        ]);

        $mirror = $this->ledger->reverse(
            $entry,
            $data['memo'] ?? null,
            $request->user(),
            $data['entry_date'] ?? null,
        );

        ActivityLog::record('journal.reversed', $entry, "عكس القيد {$entry->code} بالقيد {$mirror->code}");

        return response()->json(['data' => $this->entryPayload($mirror->load('lines.account'))], 201);
    }

    public function destroyEntry(JournalEntry $entry): JsonResponse
    {
        $this->ledger->void($entry);

        ActivityLog::record('journal.voided', $entry, "إلغاء القيد اليدوي {$entry->code}");

        return response()->json(['message' => 'تم إلغاء القيد.']);
    }

    /* ── Statements ──────────────────────────────────────── */

    public function ledgerFor(Request $request, Account $account): JsonResponse
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);

        return response()->json([
            'data' => $this->reports->ledger($account, $filters['from'] ?? null, $filters['to'] ?? null),
        ]);
    }

    public function trialBalance(Request $request): JsonResponse
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);
        $this->chart->ensure();

        return response()->json([
            'data' => $this->reports->trialBalance($filters['from'] ?? null, $filters['to'] ?? null),
        ]);
    }

    public function incomeStatement(Request $request): JsonResponse
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);
        $this->chart->ensure();

        return response()->json([
            'data' => $this->reports->incomeStatement($filters['from'] ?? null, $filters['to'] ?? null),
        ]);
    }

    public function balanceSheet(Request $request): JsonResponse
    {
        $filters = $request->validate(['as_of' => ['nullable', 'date']]);
        $this->chart->ensure();

        return response()->json([
            'data' => $this->reports->balanceSheet($filters['as_of'] ?? null),
        ]);
    }

    /**
     * The numbers the accounting shell carries above its sections, plus how
     * much of the business has not reached the journal.
     */
    public function summary(Request $request): JsonResponse
    {
        $this->chart->ensure();

        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);
        $from = $filters['from'] ?? now()->startOfYear()->toDateString();
        $to = $filters['to'] ?? null;

        $income = $this->reports->incomeStatement($from, $to);
        $sheet = $this->reports->balanceSheet($to);

        return response()->json([
            'period' => ['from' => $from, 'to' => $to],
            'revenue' => $income['revenue_total'],
            'expenses' => round($income['cost_of_sales_total'] + $income['expenses_total'], 2),
            'net_profit' => $income['net_profit'],
            'assets' => $sheet['assets_total'],
            'liabilities' => $sheet['liabilities_total'],
            'equity' => $sheet['equity_total'],
            'balanced' => abs($sheet['difference']) < 0.005,
            'unposted' => $this->reports->unposted(),
        ]);
    }

    /** Re-derive entries for documents written before the ledger, or missed by it. */
    public function post(Request $request): JsonResponse
    {
        $posted = $this->backfill->run($request->user());

        return response()->json([
            'message' => 'تم ترحيل '.array_sum($posted).' قيد.',
            'data' => $posted,
        ]);
    }

    // ── Internals ────────────────────────────────────────────

    /** @return array<string, mixed> */
    protected function entryPayload(JournalEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'code' => $entry->code,
            'entry_date' => $entry->entry_date?->toDateString(),
            'memo' => $entry->memo,
            'source' => $entry->source->value,
            'source_label' => $entry->source->label(),
            'is_manual' => $entry->source->isManual(),
            'is_void' => $entry->is_void,
            'reverses' => $entry->reverses?->code,
            'total' => (float) $entry->total,
            'created_by' => $entry->creator?->name,
            'lines' => $entry->lines->map(fn ($line) => [
                'id' => $line->id,
                'account_id' => $line->account_id,
                'account_code' => $line->account?->code,
                'account_name' => $line->account?->name,
                'cost_center' => $line->costCenter?->name,
                'debit' => (float) $line->debit,
                'credit' => (float) $line->credit,
                'memo' => $line->memo,
            ])->values(),
        ];
    }

    /**
     * Balances for every account, with a group carrying the total of what sits
     * beneath it — the figure a heading is there to show.
     *
     * @param  \Illuminate\Support\Collection<int, Account>  $accounts
     * @return array<int, float>
     */
    protected function balancesFor($accounts, ?string $from, ?string $to): array
    {
        // One query for the whole chart rather than one per account: a balance
        // is the same sum whoever asks for it.
        $sums = Account::movementQuery($from, $to)
            ->groupBy('journal_lines.account_id')
            ->selectRaw('journal_lines.account_id,
                         coalesce(sum(journal_lines.debit), 0) - coalesce(sum(journal_lines.credit), 0) as net')
            ->pluck('net', 'account_id');

        $rolled = [];

        foreach ($accounts as $account) {
            $rolled[$account->id] = round((float) ($sums[$account->id] ?? 0) * $account->type->sign(), 2);
        }

        // Deepest first, so a child's total has already absorbed its own
        // children by the time it is added to its parent.
        foreach ($accounts->sortByDesc(fn (Account $a) => strlen($a->code)) as $account) {
            if ($account->parent_id && isset($rolled[$account->parent_id])) {
                $rolled[$account->parent_id] = round($rolled[$account->parent_id] + $rolled[$account->id], 2);
            }
        }

        return $rolled;
    }

    /**
     * How deep each account sits, by walking its parents once.
     *
     * @param  \Illuminate\Support\Collection<int, Account>  $accounts
     * @return array<int, int>
     */
    protected function depths($accounts): array
    {
        $parents = $accounts->pluck('parent_id', 'id');
        $depths = [];

        foreach ($accounts as $account) {
            $depth = 0;
            $parentId = $account->parent_id;

            // The bound is a guard against a cycle an edit could introduce,
            // not an assumption about how deep a real chart goes.
            while ($parentId && $depth < 8) {
                $depth++;
                $parentId = $parents[$parentId] ?? null;
            }

            $depths[$account->id] = $depth;
        }

        return $depths;
    }

    /** A child under a heading of a different type would break every report. */
    protected function assertParentAgrees(array $data): void
    {
        if (empty($data['parent_id'])) {
            return;
        }

        $parent = Account::find($data['parent_id']);

        if ($parent && $parent->type->value !== $data['type']) {
            throw ValidationException::withMessages([
                'parent_id' => "الحساب الأب «{$parent->name}» من نوع {$parent->type->label()}، فلا يصح إدراج حساب من نوع آخر تحته.",
            ]);
        }
    }
}
