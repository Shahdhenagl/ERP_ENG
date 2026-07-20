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
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Warehouse;
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
                'name' => 'بنك القاهرة — فرع المعادي',
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
        ])->map(fn ($a, $index) => Asset::create([
            ...$a,
            'customer_id' => $customers[$index % $customers->count()]->id,
            'site_address' => $customers[$index % $customers->count()]->address,
            'status' => AssetStatus::Active,
            'created_by' => $manager->id,
        ]));

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

            $task = Task::create([
                ...$blueprint,
                'customer_id' => $customer->id,
                'assigned_to' => $technician->id,
                'created_by' => $manager->id,
                'description' => 'تم فتح البلاغ من خلال الاتصال بمركز خدمة العملاء.',
                'site_address' => $customer->address,
                'site_lat' => $customer->lat,
                'site_lng' => $customer->lng,
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

        $ledger->receive($battery, $main, 20, 950, $manager, ['supplier' => 'النور للبطاريات']);
        $ledger->receive($battery, $main, 10, 1010, $manager, ['supplier' => 'النور للبطاريات']);
        $ledger->receive($fan, $main, 12, 180, $manager, ['supplier' => 'الحرة للقطع']);
        $ledger->receive($fuse, $main, 15, 25, $manager, ['supplier' => 'الحرة للقطع']);

        // Two technicians are carrying stock; the third is empty, which is a
        // state the UI has to handle too.
        $ledger->transfer($battery, $main, Warehouse::forTechnician($technicians[0]), 4, $manager);
        $ledger->transfer($fan, $main, Warehouse::forTechnician($technicians[0]), 2, $manager);
        $ledger->transfer($battery, $main, Warehouse::forTechnician($technicians[1]), 2, $manager);

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
