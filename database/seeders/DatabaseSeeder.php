<?php

namespace Database\Seeders;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Enums\UserRole;
use App\Models\Customer;
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

        // ── Jobs spread across the whole lifecycle ───────────
        $blueprints = [
            [
                'title' => 'صيانة دورية لجهاز UPS 20kVA',
                'type' => TaskType::Maintenance,
                'priority' => TaskPriority::Normal,
                'status' => TaskStatus::Pending,
                'device_brand' => 'APC', 'device_model' => 'Symmetra LX', 'device_capacity' => '20 kVA',
                'device_serial' => 'APC-SLX-88213',
                'scheduled_at' => now()->addDay()->setTime(10, 0),
            ],
            [
                'title' => 'عطل مفاجئ — الجهاز يعمل على البطاريات باستمرار',
                'type' => TaskType::Repair,
                'priority' => TaskPriority::Urgent,
                'status' => TaskStatus::InProgress,
                'device_brand' => 'Eaton', 'device_model' => '9PX', 'device_capacity' => '11 kVA',
                'device_serial' => 'ETN-9PX-40912',
                'scheduled_at' => now()->subHours(3),
            ],
            [
                'title' => 'تركيب وتشغيل أولي لجهاز UPS 60kVA',
                'type' => TaskType::Installation,
                'priority' => TaskPriority::High,
                'status' => TaskStatus::Accepted,
                'device_brand' => 'Vertiv', 'device_model' => 'Liebert GXT5', 'device_capacity' => '60 kVA',
                'device_serial' => 'VRT-GXT5-11077',
                'scheduled_at' => now()->addDays(2)->setTime(9, 30),
            ],
            [
                'title' => 'معاينة موقع قبل توريد جهاز جديد',
                'type' => TaskType::Inspection,
                'priority' => TaskPriority::Low,
                'status' => TaskStatus::Completed,
                'scheduled_at' => now()->subDays(3),
            ],
            [
                'title' => 'استبدال بنك بطاريات — انتهاء العمر الافتراضي',
                'type' => TaskType::Maintenance,
                'priority' => TaskPriority::High,
                'status' => TaskStatus::OnTheWay,
                'device_brand' => 'APC', 'device_model' => 'Smart-UPS SRT', 'device_capacity' => '10 kVA',
                'device_serial' => 'APC-SRT-55621',
                'scheduled_at' => now()->addHours(4),
            ],
        ];

        foreach ($blueprints as $index => $blueprint) {
            $customer = $customers[$index % $customers->count()];
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
