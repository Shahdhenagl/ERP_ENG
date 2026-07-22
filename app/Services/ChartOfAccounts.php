<?php

namespace App\Services;

use App\Models\Account;
use App\Models\CashBox;
use Illuminate\Support\Facades\DB;

/**
 * The default chart, and the machine keys the posting rules look accounts up by.
 *
 * Seeded on first use rather than by a migration, the same way the main cash
 * box and the main store are: a company that never opens the accounting screen
 * should not carry forty rows it never asked for, and a fresh install must not
 * be able to reach a state where an invoice cannot post.
 *
 * Renaming any of these is expected — the rules follow `key`, not the name.
 * Deleting a keyed account is refused, because a rule with nowhere to post is
 * a document that cannot be issued.
 */
class ChartOfAccounts
{
    /**
     * code, name, type, key, is_group.
     *
     * Codes are hierarchical: a child's parent is whichever seeded account its
     * code starts with. That keeps the tree in one readable table instead of a
     * nest of arrays.
     *
     * @var array<int, array{0: string, 1: string, 2: string, 3: ?string, 4: bool}>
     */
    public const DEFAULT = [
        // ── 1 Assets ─────────────────────────────────────────
        ['1',    'الأصول',                        'asset',     null,               true],
        ['11',   'الأصول المتداولة',              'asset',     null,               true],
        ['1101', 'النقدية وما في حكمها',          'asset',     'cash',             true],
        ['1102', 'العملاء (المدينون)',            'asset',     'receivable',       false],
        ['1103', 'المخزون',                       'asset',     'inventory',        false],
        ['1104', 'عهد الموظفين',                  'asset',     'staff_custody',    true],
        ['1105', 'مصروفات مدفوعة مقدمًا',          'asset',     null,               false],
        // Tax we paid our suppliers and reclaim against tax we charged.
        ['1106', 'ضريبة القيمة المضافة على المشتريات', 'asset',  'vat_input',        false],
        ['12',   'الأصول الثابتة',                'asset',     null,               true],
        ['1201', 'أصول ثابتة',                    'asset',     'fixed_assets',     false],
        ['1202', 'مجمع الإهلاك',                  'asset',     'depreciation',     false],

        // ── 2 Liabilities ────────────────────────────────────
        ['2',    'الخصوم',                        'liability', null,               true],
        ['21',   'الخصوم المتداولة',              'liability', null,               true],
        ['2101', 'الموردون (الدائنون)',           'liability', 'payable',          false],
        ['2102', 'ضريبة القيمة المضافة المستحقة', 'liability', 'vat_output',       false],
        ['2103', 'مصروفات مستحقة',                'liability', null,               false],

        // ── 3 Equity ─────────────────────────────────────────
        ['3',    'حقوق الملكية',                  'equity',    null,               true],
        ['3101', 'رأس المال',                     'equity',    'capital',          false],
        ['3102', 'الأرباح المرحّلة',              'equity',    'retained_earnings', false],
        ['3103', 'أرصدة افتتاحية',                'equity',    'opening_equity',   false],

        // ── 4 Revenue ────────────────────────────────────────
        ['4',    'الإيرادات',                     'revenue',   null,               true],
        ['4101', 'إيرادات المبيعات',              'revenue',   'sales_revenue',    false],
        ['4102', 'إيرادات الصيانة والخدمات',      'revenue',   'service_revenue',  false],
        ['4103', 'إيرادات أخرى',                  'revenue',   null,               false],
        // Contra-revenue: carries a debit balance and nets off the two above,
        // which is exactly what a discount does to a period's income.
        ['4104', 'خصم مسموح به',                  'revenue',   'sales_discount',   false],
        // Also contra-revenue: what was sold and handed back, kept visible
        // rather than netted off the sales figure it reverses.
        ['4105', 'مرتجعات المبيعات',              'revenue',   'sales_return',     false],

        // ── 5 Expenses ───────────────────────────────────────
        ['5',    'المصروفات',                     'expense',   null,               true],
        ['51',   'تكلفة المبيعات',                'expense',   null,               true],
        ['5101', 'تكلفة البضاعة المباعة',         'expense',   'cogs',             false],
        ['5102', 'عجز وزيادة المخزون',            'expense',   'stock_adjustment', false],
        // Where a supplier bill disagrees with the price the goods came in at.
        ['5103', 'فروق أسعار الشراء',             'expense',   'purchase_variance', false],
        ['52',   'مصروفات تشغيلية',               'expense',   null,               true],
        ['5201', 'رواتب وأجور',                   'expense',   null,               false],
        ['5202', 'إيجارات',                       'expense',   null,               false],
        ['5203', 'كهرباء ومياه',                  'expense',   null,               false],
        ['5204', 'وقود وانتقالات',                'expense',   null,               false],
        ['5205', 'صيانة وإصلاحات',                'expense',   null,               false],
        ['5206', 'مصروفات بنكية',                 'expense',   null,               false],
        ['5207', 'مصروفات عمومية',                'expense',   'general_expense',  false],
    ];

    /**
     * Make sure the chart exists and every cash box has an account under it.
     *
     * Idempotent, and safe to call on every read of the accounting screens:
     * accounts are matched by code, so an operator's renames and additions
     * survive it.
     */
    public function ensure(): void
    {
        if (Account::query()->exists() && ! $this->missingKeys()) {
            $this->syncCashBoxes();

            return;
        }

        DB::transaction(function () {
            foreach (self::DEFAULT as [$code, $name, $type, $key, $isGroup]) {
                Account::updateOrCreate(
                    ['code' => $code],
                    [
                        'name' => $name,
                        'type' => $type,
                        'key' => $key,
                        'is_group' => $isGroup,
                        'is_system' => true,
                        'parent_id' => $this->parentFor($code)?->id,
                    ],
                );
            }
        });

        $this->syncCashBoxes();
    }

    /** True when a rule's account is missing, which is the only reason to re-seed. */
    protected function missingKeys(): bool
    {
        $wanted = array_filter(array_column(self::DEFAULT, 3));
        $have = Account::whereNotNull('key')->pluck('key')->all();

        return (bool) array_diff($wanted, $have);
    }

    /**
     * The seeded account whose code is the longest prefix of this one.
     *
     * '5201' sits under '52', which sits under '5'. Walking the string back is
     * enough because the codes were designed that way.
     */
    protected function parentFor(string $code): ?Account
    {
        for ($length = strlen($code) - 1; $length > 0; $length--) {
            $parent = Account::where('code', substr($code, 0, $length))->first();

            if ($parent) {
                return $parent;
            }
        }

        return null;
    }

    /**
     * Give every cash box its own account.
     *
     * A company box lands under «النقدية»; a technician's float lands under
     * «عهد الموظفين», so the balance sheet distinguishes money in the till from
     * money someone is carrying — which is the distinction the treasury screen
     * already draws and the one an auditor asks about first.
     */
    public function syncCashBoxes(): void
    {
        foreach (CashBox::with('holder')->whereNull('account_id')->get() as $box) {
            $this->accountFor($box);
        }
    }

    /**
     * The account behind one box, opened the first time it is needed.
     *
     * On demand rather than at box creation so a box opened before this module
     * existed — or by a seeder, or a test — still posts correctly the first
     * time money moves through it.
     */
    public function accountFor(CashBox $box): Account
    {
        if ($box->account_id && ($existing = Account::find($box->account_id))) {
            return $existing;
        }

        $parent = Account::key($box->isCustody() ? 'staff_custody' : 'cash');

        $account = Account::create([
            'code' => $this->nextChildCode($parent),
            'name' => $box->isCustody()
                ? 'عهدة '.($box->holder?->name ?? $box->name)
                : $box->name,
            'type' => 'asset',
            'parent_id' => $parent->id,
            'is_group' => false,
            // Deleting the account behind a live box would orphan its postings,
            // so it is protected the same way a seeded one is.
            'is_system' => true,
        ]);

        $box->forceFill(['account_id' => $account->id])->save();

        return $account;
    }

    /** Next free code under a parent: 1101 → 110101, 110102, … */
    protected function nextChildCode(Account $parent): string
    {
        $used = Account::where('parent_id', $parent->id)->pluck('code');

        for ($n = 1; $n <= 99; $n++) {
            $code = $parent->code.str_pad((string) $n, 2, '0', STR_PAD_LEFT);

            if (! $used->contains($code)) {
                return $code;
            }
        }

        // A hundred boxes under one heading is not a real situation, but a
        // collision would be silent, and silence is the thing to avoid.
        return $parent->code.'-'.uniqid();
    }
}
