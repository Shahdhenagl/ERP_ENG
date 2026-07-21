<?php

namespace Database\Seeders;

use App\Enums\AssetStatus;
use App\Enums\ContractStatus;
use App\Enums\ItemCategory;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Enums\UserRole;
use App\Models\Asset;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\Quotation;
use App\Models\Setting;
use App\Models\Supplier;
use App\Models\Warehouse;
use App\Services\BillingService;
use App\Services\CustodyService;
use App\Services\PurchasingService;
use App\Services\SalesService;
use App\Services\MaintenancePlanner;
use App\Services\StockLedger;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Note: deliberately does NOT use WithoutModelEvents — Customer and Task
 * generate their `code` in a `creating` hook, which that trait would suppress.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // ── The letterhead every document prints with ────────
        Setting::put([
            'company_name' => 'City Engineering',
            'company_tagline' => 'Expertise in Standby Energy',
            'company_address' => '15 شارع التحرير، الدقي، الجيزة',
            'company_phone' => '0233456789',
            'company_email' => 'info@cityeng.local',
            'company_tax_id' => '512-874-336',
            'company_commercial_id' => '84719',
            'invoice_footer' => 'يُرجى السداد خلال 15 يومًا من تاريخ الفاتورة.',
            'quotation_terms' => "الأسعار شاملة التوريد والتركيب.\nالدفع: 50% مقدم والباقي عند التشغيل.\nالضمان: سنتان على الجهاز، سنة على البطاريات.",
        ]);

        // ── Accounts ─────────────────────────────────────────
        User::create([
            'name' => 'مدير النظام',
            'email' => 'admin@cityeng.local',
            'password' => 'password',
            'role' => UserRole::Admin,
            'phone' => '01000000001',
            'whatsapp' => '01000000001',
            'job_title' => 'مدير النظام',
        ]);

        $manager = User::create([
            'name' => 'أحمد منصور',
            'email' => 'manager@cityeng.local',
            'password' => 'password',
            'role' => UserRole::Manager,
            'phone' => '01000000002',
            'whatsapp' => '01000000002',
            'job_title' => 'مدير العمليات',
        ]);

        $technicians = collect([
            ['name' => 'محمود سعيد', 'email' => 'tech1@cityeng.local', 'phone' => '01000000003', 'job_title' => 'فني أول UPS'],
            ['name' => 'كريم عبد الله', 'email' => 'tech2@cityeng.local', 'phone' => '01000000004', 'job_title' => 'فني صيانة'],
            ['name' => 'يوسف إبراهيم', 'email' => 'tech3@cityeng.local', 'phone' => '01000000005', 'job_title' => 'فني تركيبات'],
        ])->map(fn ($t) => User::create([
            ...$t,
            'password' => 'password',
            'role' => UserRole::Technician,
            'whatsapp' => $t['phone'],
        ]));

        // ── Customers ────────────────────────────────────────
        $customers = collect([
            [
                'name' => 'شركة النيل للأدوية',
                'company' => 'النيل فارما',
                'phone' => '01111111111',
                'address' => '15 شارع التحرير، الدقي، الجيزة',
                'city' => 'الجيزة',
                'lat' => 30.0385,
                'lng' => 31.2110,
            ],
            [
                'name' => 'مستشفى الأمل التخصصي',
                'company' => 'الأمل الطبية',
                'phone' => '01222222222',
                'address' => '42 شارع مصطفى النحاس، مدينة نصر، القاهرة',
                'city' => 'القاهرة',
                'lat' => 30.0626,
                'lng' => 31.3450,
            ],
            [
                // One account with branches under it, rather than a customer
                // per branch — which is what this used to be.
                'name' => 'بنك القاهرة',
                'company' => 'بنك القاهرة',
                'phone' => '01333333333',
                'address' => '9 شارع 9، المعادي، القاهرة',
                'city' => 'القاهرة',
                'lat' => 29.9602,
                'lng' => 31.2569,
            ],
            [
                'name' => 'مصنع الدلتا للبلاستيك',
                'company' => 'الدلتا جروب',
                'phone' => '01444444444',
                'address' => 'المنطقة الصناعية، العاشر من رمضان',
                'city' => 'الشرقية',
                'lat' => 30.2966,
                'lng' => 31.7420,
            ],
        ])->map(fn ($c) => Customer::create([
            ...$c,
            'whatsapp' => $c['phone'],
            'created_by' => $manager->id,
        ]));

        // ── Branches ─────────────────────────────────────────
        // Every account opens with the site its address describes; the
        // migration does the same for customers that already existed.
        $branches = $customers->map(fn (Customer $customer) => Branch::create([
            'customer_id' => $customer->id,
            'name' => 'الفرع الرئيسي',
            'address' => $customer->address,
            'city' => $customer->city,
            'lat' => $customer->lat,
            'lng' => $customer->lng,
            'contact_phone' => $customer->phone,
            'contact_whatsapp' => $customer->whatsapp,
            'working_hours' => '٩ ص - ٥ م، الجمعة مغلق',
            'created_by' => $manager->id,
        ]));

        // The bank has a second site — the case branches exist for. Its devices
        // and its contact are its own, and a job sent here navigates here.
        $secondBranch = Branch::create([
            'customer_id' => $customers[2]->id,
            'name' => 'فرع مدينة نصر',
            'customer_ref' => 'CIB-114',
            'address' => '77 شارع عباس العقاد، مدينة نصر، القاهرة',
            'city' => 'القاهرة',
            'lat' => 30.0561,
            'lng' => 31.3300,
            'contact_name' => 'أ. سامي عبد الحميد',
            'contact_phone' => '01099887766',
            'contact_whatsapp' => '01099887766',
            'working_hours' => '٨:٣٠ ص - ٤ م',
            'created_by' => $manager->id,
        ]);

        // ── The serialized devices those customers own ───────
        // Warranty deliberately varies: in force, expired, and unknown — the
        // three states the UI has to tell apart.
        $assets = collect([
            [
                'serial' => 'APC-SLX-88213',
                'brand' => 'APC', 'model' => 'Symmetra LX', 'capacity' => '20 kVA',
                'sold_at' => now()->subMonths(8), 'warranty_months' => 24,
                'installed_at' => now()->subMonths(7),
            ],
            [
                'serial' => 'ETN-9PX-40912',
                'brand' => 'Eaton', 'model' => '9PX', 'capacity' => '11 kVA',
                'sold_at' => now()->subMonths(38), 'warranty_months' => 24,
                'installed_at' => now()->subMonths(37),
            ],
            [
                'serial' => 'VRT-GXT5-11077',
                'brand' => 'Vertiv', 'model' => 'Liebert GXT5', 'capacity' => '60 kVA',
                'sold_at' => now()->subDays(20), 'warranty_months' => 36,
            ],
            [
                'serial' => 'APC-SRT-55621',
                'brand' => 'APC', 'model' => 'Smart-UPS SRT', 'capacity' => '10 kVA',
                // Bought before the system existed — nobody knows the date.
                'sold_at' => null, 'warranty_months' => null,
                'installed_at' => now()->subYears(4),
            ],
        ])->map(function ($a, $index) use ($customers, $branches, $secondBranch, $manager) {
            $customer = $customers[$index % $customers->count()];

            // The bank is customer 2, and its device sits at the Nasr City
            // site rather than the main one — so the registry has a customer
            // whose units are not all at the address on the account.
            $branch = $index === 2 ? $secondBranch : $branches[$index % $branches->count()];

            return Asset::create([
                ...$a,
                'customer_id' => $customer->id,
                'branch_id' => $branch->id,
                'site_address' => $branch->address,
                'status' => AssetStatus::Active,
                'created_by' => $manager->id,
            ]);
        });

        // ── A live maintenance contract ──────────────────────
        // Started two months ago so part of the plan is already behind us and
        // the next visit is close enough to have a work order — the state the
        // dashboard is actually meant to show.
        $contract = Contract::create([
            'customer_id' => $customers[0]->id,
            'title' => 'عقد صيانة سنوي — أربع زيارات',
            'starts_on' => now()->subMonths(2)->toDateString(),
            'ends_on' => now()->addMonths(10)->toDateString(),
            'visits_per_year' => 4,
            'status' => ContractStatus::Active,
            'value' => 48000,
            'sla_response_hours' => 4,
            'sla_resolution_hours' => 24,
            'notes' => 'يشمل قطع الغيار الاستهلاكية عدا البطاريات.',
            'created_by' => $manager->id,
        ]);

        $contract->assets()->attach([$assets[0]->id, $assets[3]->id]);

        $planner = app(MaintenancePlanner::class);
        $planner->plan($contract);
        $planner->materialiseDueVisits();

        // A draft too — the state a manager sees before signing anything off.
        Contract::create([
            'customer_id' => $customers[1]->id,
            'title' => 'عقد صيانة نصف سنوي',
            'starts_on' => now()->addWeeks(2)->toDateString(),
            'ends_on' => now()->addWeeks(2)->addYear()->toDateString(),
            'visits_per_year' => 2,
            'value' => 22000,
            'sla_response_hours' => 8,
            'sla_resolution_hours' => 48,
            'created_by' => $manager->id,
        ]);

        // ── Jobs spread across the whole lifecycle ───────────
        $blueprints = [
            [
                'title' => 'صيانة دورية لجهاز UPS 20kVA',
                'type' => TaskType::Maintenance,
                'priority' => TaskPriority::Normal,
                'status' => TaskStatus::Pending,
                'asset_id' => $assets[0]->id,
                'scheduled_at' => now()->addDay()->setTime(10, 0),
            ],
            [
                'title' => 'عطل مفاجئ — الجهاز يعمل على البطاريات باستمرار',
                'type' => TaskType::Repair,
                'priority' => TaskPriority::Urgent,
                'status' => TaskStatus::InProgress,
                'asset_id' => $assets[1]->id,
                'scheduled_at' => now()->subHours(3),
            ],
            [
                'title' => 'تركيب وتشغيل أولي لجهاز UPS 60kVA',
                'type' => TaskType::Installation,
                'priority' => TaskPriority::High,
                'status' => TaskStatus::Accepted,
                'asset_id' => $assets[2]->id,
                'scheduled_at' => now()->addDays(2)->setTime(9, 30),
            ],
            [
                'title' => 'معاينة موقع قبل توريد جهاز جديد',
                'type' => TaskType::Inspection,
                'priority' => TaskPriority::Low,
                'status' => TaskStatus::Completed,
                // No device yet — that is the point of a site survey.
                'scheduled_at' => now()->subDays(3),
            ],
            [
                'title' => 'استبدال بنك بطاريات — انتهاء العمر الافتراضي',
                'type' => TaskType::Maintenance,
                'priority' => TaskPriority::High,
                'status' => TaskStatus::OnTheWay,
                'asset_id' => $assets[3]->id,
                'scheduled_at' => now()->addHours(4),
            ],
        ];

        foreach ($blueprints as $index => $blueprint) {
            // A job about a device belongs to whoever owns that device — the
            // API enforces this, so the seed data has to honour it too.
            $customer = isset($blueprint['asset_id'])
                ? $assets->firstWhere('id', $blueprint['asset_id'])->customer
                : $customers[$index % $customers->count()];

            $technician = $technicians[$index % $technicians->count()];
            $status = $blueprint['status'];

            $advanced = [TaskStatus::OnTheWay, TaskStatus::InProgress, TaskStatus::Completed];

            // A job goes to the site its device sits at, not to the address on
            // the account — which is the point of having branches at all.
            $branch = isset($blueprint['asset_id'])
                ? $assets->firstWhere('id', $blueprint['asset_id'])?->branch
                : null;

            $task = Task::create([
                ...$blueprint,
                'customer_id' => $customer->id,
                'branch_id' => $branch?->id,
                'assigned_to' => $technician->id,
                'created_by' => $manager->id,
                'description' => 'تم فتح البلاغ من خلال الاتصال بمركز خدمة العملاء.',
                'site_address' => $branch?->address ?? $customer->address,
                'site_lat' => $branch?->lat ?? $customer->lat,
                'site_lng' => $branch?->lng ?? $customer->lng,
                // Backfill the timestamps the seeded status implies.
                'accepted_at' => $status !== TaskStatus::Pending ? now()->subHours(5) : null,
                'on_the_way_at' => in_array($status, $advanced, true) ? now()->subHours(4) : null,
                'started_at' => in_array($status, [TaskStatus::InProgress, TaskStatus::Completed], true) ? now()->subHours(3) : null,
                'completed_at' => $status === TaskStatus::Completed ? now()->subHours(2) : null,
            ]);

            if ($status === TaskStatus::Completed) {
                $task->reports()->create([
                    'user_id' => $technician->id,
                    'type' => 'completion',
                    'input_voltage' => 221.5,
                    'output_voltage' => 230.0,
                    'frequency' => 50.0,
                    'load_percent' => 46.5,
                    'battery_voltage' => 272.4,
                    'temperature' => 28.5,
                    'backup_minutes' => 18,
                    'device_condition' => 'good',
                    'batteries_need_replacement' => false,
                    'findings' => 'الموقع مناسب للتركيب، التهوية جيدة ولوحة التغذية تتحمل الحمل المطلوب.',
                    'actions_taken' => 'تم رفع المقاسات وتصوير لوحة التوزيع وتحديد مسار الكابلات.',
                    'recommendations' => 'يفضل تركيب مروحة شفط إضافية قبل التشغيل.',
                    'signed_by_name' => 'م. طارق فؤاد',
                    'signed_at' => now()->subHours(2),
                ]);
            }
        }

        // ── Inventory ────────────────────────────────────────
        // Received at two prices on purpose, so the weighted average is
        // visibly something other than either invoice price.
        $ledger = app(StockLedger::class);
        $main = Warehouse::main();

        $battery = Item::create([
            'name' => 'بطارية 12V 100Ah',
            'category' => ItemCategory::Battery,
            'unit' => 'قطعة',
            'reorder_level' => 8,
            'created_by' => $manager->id,
        ]);

        $fan = Item::create([
            'name' => 'مروحة تبريد 120mm',
            'category' => ItemCategory::SparePart,
            'unit' => 'قطعة',
            'reorder_level' => 4,
            'created_by' => $manager->id,
        ]);

        $fuse = Item::create([
            'name' => 'فيوز 32A',
            'category' => ItemCategory::Consumable,
            'unit' => 'قطعة',
            'reorder_level' => 20,
            'created_by' => $manager->id,
        ]);

        // ── Suppliers and buying ─────────────────────────────
        $purchasing = app(PurchasingService::class);

        $batterySupplier = Supplier::create([
            'name' => 'النور للبطاريات',
            'company' => 'النور تريدنج',
            'phone' => '01555555555',
            'created_by' => $manager->id,
        ]);

        $partsSupplier = Supplier::create([
            'name' => 'الحرة للقطع',
            'phone' => '01666666666',
            'created_by' => $manager->id,
        ]);

        // Two prices on purpose, so the weighted average is visibly neither.
        $purchasing->receiveDirect($batterySupplier, $battery, 20, 950, $manager);
        $purchasing->receiveDirect($batterySupplier, $battery, 10, 1010, $manager);
        $purchasing->receiveDirect($partsSupplier, $fan, 12, 180, $manager);
        $purchasing->receiveDirect($partsSupplier, $fuse, 15, 25, $manager);

        // An order still waiting on part of its delivery — the state the
        // purchasing screen exists to show.
        $order = PurchaseOrder::create([
            'supplier_id' => $batterySupplier->id,
            'expected_date' => now()->addWeek()->toDateString(),
            'tax_rate' => 14,
            'notes' => 'دفعة البطاريات الربع سنوية.',
            'created_by' => $manager->id,
        ]);

        $order->lines()->create(['item_id' => $battery->id, 'qty' => 24, 'unit_price' => 980, 'sort' => 0]);
        $order->lines()->create(['item_id' => $fuse->id, 'qty' => 50, 'unit_price' => 24, 'sort' => 1]);

        $purchasing->send($order);
        $purchasing->receiveAgainstOrder(
            $order,
            [['item_id' => $battery->id, 'qty' => 10, 'unit_cost' => 980]],
            $manager,
            ['reference' => 'INV-NOOR-4471'],
        );

        // ── The commercial chain ─────────────────────────────
        // One quote still awaiting an answer, and one carried all the way
        // through to an order — the two states the sales screen exists to show.
        $sales = app(SalesService::class);

        $pending = Quotation::create([
            'customer_id' => $customers[1]->id,
            'title' => 'توريد وتركيب جهاز UPS 20kVA',
            'valid_until' => now()->addDays(10)->toDateString(),
            'tax_rate' => 14,
            'terms' => 'الدفع: 50% مقدم، والباقي عند التشغيل. التوريد خلال أسبوعين.',
            'created_by' => $manager->id,
        ]);

        $pending->lines()->create([
            'description' => 'جهاز UPS 20kVA — APC Symmetra',
            'qty' => 1, 'unit_price' => 185000, 'line_total' => 185000, 'sort' => 0,
        ]);
        $pending->lines()->create([
            'item_id' => $battery->id, 'item_code' => $battery->code,
            'description' => 'بطارية 12V 100Ah',
            'qty' => 8, 'unit_price' => 1400, 'line_total' => 11200, 'sort' => 1,
        ]);
        $pending->lines()->create([
            'description' => 'أعمال التركيب والتشغيل الأولي',
            'qty' => 1, 'unit_price' => 12000, 'line_total' => 12000, 'sort' => 2,
        ]);

        $sales->send($sales->recalculateQuotation($pending));

        $won = Quotation::create([
            'customer_id' => $customers[2]->id,
            'title' => 'استبدال بنك بطاريات',
            'valid_until' => now()->addDays(20)->toDateString(),
            'tax_rate' => 14,
            'created_by' => $manager->id,
        ]);

        $won->lines()->create([
            'item_id' => $battery->id, 'item_code' => $battery->code,
            'description' => 'بطارية 12V 100Ah',
            'qty' => 16, 'unit_price' => 1400, 'line_total' => 22400, 'sort' => 0,
        ]);
        $won->lines()->create([
            'description' => 'أجر تركيب واختبار',
            'qty' => 1, 'unit_price' => 4500, 'line_total' => 4500, 'sort' => 1,
        ]);

        $sales->acceptToOrder($sales->send($sales->recalculateQuotation($won)), $manager);

        // Two technicians are carrying stock; the third is empty, which is a
        // state the UI has to handle too.
        $ledger->transfer($battery, $main, Warehouse::forTechnician($technicians[0]), 4, $manager);
        $ledger->transfer($fan, $main, Warehouse::forTechnician($technicians[0]), 2, $manager);
        $ledger->transfer($battery, $main, Warehouse::forTechnician($technicians[1]), 2, $manager);

        // ── Custody in its other two forms ───────────────────
        // One technician carries money and a customer's device as well as
        // stock, so the custody screen shows all three at once rather than
        // looking like it only ever tracks parts.
        $custody = app(CustodyService::class);
        $billing = app(BillingService::class);

        // The till has to hold something before a float can come out of it, and
        // money only enters through a collection — so raise and settle one
        // rather than writing a balance in by hand.
        $openingInvoice = Invoice::create([
            'customer_id' => $customers[0]->id,
            'issue_date' => now()->subMonth()->toDateString(),
            'notes' => 'صيانة دورية — الربع الأول',
            'created_by' => $manager->id,
        ]);

        $openingInvoice->lines()->create([
            'description' => 'عقد صيانة — دفعة',
            'qty' => 1,
            'unit_price' => 18000,
            'line_total' => 18000,
        ]);

        $billing->receivePayment([
            'invoice_id' => $billing->issue($billing->recalculate($openingInvoice))->id,
            'cash_box_id' => CashBox::default()->id,
            'amount' => 18000,
            'paid_at' => now()->subWeeks(3)->toDateString(),
        ], $manager);

        $custody->advanceCash($technicians[0], 2000, CashBox::default(), $manager, 'سلفة مصروفات ميدانية');
        $custody->spendFromCustody($technicians[0], 180, $technicians[0], [
            'category' => 'مواصلات',
            'note' => 'انتقال إلى موقع العميل',
        ]);

        $custody->takeDevice($assets[3], $technicians[0], $manager, [
            'reason' => 'workshop_repair',
            'taken_from' => $assets[3]->customer?->name,
            'taken_at' => now()->subDays(4),
            'note' => 'عطل في لوحة التحكم — يحتاج فحصًا بالورشة.',
        ]);

        $this->command->info('تم إنشاء البيانات التجريبية.');
        $this->command->table(
            ['الدور', 'البريد', 'كلمة المرور'],
            [
                ['مدير النظام', 'admin@cityeng.local', 'password'],
                ['مدير', 'manager@cityeng.local', 'password'],
                ['فني', 'tech1@cityeng.local', 'password'],
            ],
        );
    }
}
