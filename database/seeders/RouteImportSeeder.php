<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Customer;
use Illuminate\Database\Seeder;

/**
 * The customer routes from the "Route CityEng" sheet: three customers, their
 * sites across the country, and the trip — خط السير — to each, with its fares,
 * allowance and lodging.
 *
 * Idempotent. A customer is matched by name and a site by (customer, name), so
 * running it again refreshes the routes instead of duplicating anyone. Safe to
 * run on the server after deploy: `php artisan db:seed --class=RouteImportSeeder`.
 */
class RouteImportSeeder extends Seeder
{
    public function run(): void
    {
        $blocks = json_decode(self::DATA, true);

        foreach ($blocks as $block) {
            $customer = Customer::firstOrCreate(
                ['name' => $block['company']],
                ['type' => 'company'],
            );

            $name = mb_substr($block['address'] !== '' ? $block['address'] : 'فرع', 0, 160);

            Branch::updateOrCreate(
                ['customer_id' => $customer->id, 'name' => $name],
                [
                    'address' => $block['address'] ?: null,
                    'route' => $block['route'],
                    'is_active' => true,
                ],
            );
        }
    }

    private const DATA = <<<'JSON'
[
    {
        "company": "سيمكس",
        "address": "اكتوبر",
        "route": {
            "legs": [
                {
                    "label": "إلى رمسيس",
                    "cost": 20.0
                },
                {
                    "label": "إلى طريق اسكندريه",
                    "cost": 37.0
                },
                {
                    "label": "إلى القرية الذكية",
                    "cost": 25.0
                },
                {
                    "label": "إلى المصانع",
                    "cost": 20.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 30.0
                },
                {
                    "label": "إلى المصانع",
                    "cost": 30.0
                },
                {
                    "label": "إلى القرية الذكية",
                    "cost": 20.0
                },
                {
                    "label": "إلى طريق اسكندريه",
                    "cost": 25.0
                },
                {
                    "label": "إلى رمسيس",
                    "cost": 37.0
                },
                {
                    "label": "إلى العرب",
                    "cost": 18.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "بني سويف- نادي قضاة بني سويف",
        "route": {
            "legs": [
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى بنى سويف",
                    "cost": 120.0
                },
                {
                    "label": "إلى نادى القضاة",
                    "cost": 70.0
                },
                {
                    "label": "إلى فرع المحافظة",
                    "cost": 70.0
                },
                {
                    "label": "إلى الموقف",
                    "cost": 60.0
                },
                {
                    "label": "إلى رمسيس",
                    "cost": 120.0
                },
                {
                    "label": "إلى صقر",
                    "cost": 18.0
                }
            ],
            "allowance": 120.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "بلبيس الصناعية - الشرقية",
        "route": {
            "legs": [
                {
                    "label": "إلى الموقف الجديد",
                    "cost": 18.0
                },
                {
                    "label": "إلى السلام",
                    "cost": 30.0
                },
                {
                    "label": "إلى ميدان الطياره",
                    "cost": 75.0
                },
                {
                    "label": "إلى مصنع المكرونه",
                    "cost": 25.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 70.0
                },
                {
                    "label": "إلى مصنع المكرونه",
                    "cost": 70.0
                },
                {
                    "label": "إلى ميدان الطياره",
                    "cost": 25.0
                },
                {
                    "label": "إلى المحطه",
                    "cost": 25.0
                },
                {
                    "label": "إلى المحافظه",
                    "cost": 30.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 30.0
                },
                {
                    "label": "إلى المحطه",
                    "cost": 60.0
                },
                {
                    "label": "إلى موقف الاحرار",
                    "cost": 30.0
                },
                {
                    "label": "إلى السلام",
                    "cost": 70.0
                },
                {
                    "label": "إلى الموقف الجديد",
                    "cost": 30.0
                },
                {
                    "label": "إلى العرب",
                    "cost": 18.0
                }
            ],
            "allowance": 80.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "وزارة الداخلية - بتروجاس - كايروفيستيفال",
        "route": {
            "legs": [
                {
                    "label": "إلى الموقف الجديد",
                    "cost": 18.0
                },
                {
                    "label": "إلى التجمع",
                    "cost": 35.0
                },
                {
                    "label": "إلى بترو جاس",
                    "cost": 22.0
                },
                {
                    "label": "إلى كايروفيستفال",
                    "cost": 32.0
                },
                {
                    "label": "إلى وزارة الداخلية",
                    "cost": 20.0
                },
                {
                    "label": "إلى مدينة نصر",
                    "cost": 32.0
                },
                {
                    "label": "إلى الموقف الجديد+ إلى صقر",
                    "cost": 44.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "جريدة الاهرام- غرب سوميد - امريكانا بلازا - داندي مول",
        "route": {
            "legs": [
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى جريدة الأهرام",
                    "cost": 12.0
                },
                {
                    "label": "إلى رمسيس",
                    "cost": 12.0
                },
                {
                    "label": "إلى المحور",
                    "cost": 37.0
                },
                {
                    "label": "إلى فرع داندى مول",
                    "cost": 18.0
                },
                {
                    "label": "إلى المحور",
                    "cost": 18.0
                },
                {
                    "label": "إلى امريكانا بلازا",
                    "cost": 22.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 35.0
                },
                {
                    "label": "إلى الطريق",
                    "cost": 35.0
                },
                {
                    "label": "إلى غرب سوميد",
                    "cost": 21.0
                },
                {
                    "label": "إلى الحصرى",
                    "cost": 18.0
                },
                {
                    "label": "إلى التحرير",
                    "cost": 21.0
                },
                {
                    "label": "إلى العرب",
                    "cost": 18.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "زهراء عين شمس - الماظه - شبين القناطر",
        "route": {
            "legs": [
                {
                    "label": "إلى الموقف الجديد",
                    "cost": 15.0
                },
                {
                    "label": "إلى السلام",
                    "cost": 28.0
                },
                {
                    "label": "إلى مسطرد + الى شبين القناطر",
                    "cost": 38.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 40.0
                },
                {
                    "label": "إلى الموقف",
                    "cost": 40.0
                },
                {
                    "label": "إلى السلام",
                    "cost": 28.0
                },
                {
                    "label": "إلى الجراش",
                    "cost": 15.0
                },
                {
                    "label": "إلى زهراء عين شمس",
                    "cost": 18.0
                },
                {
                    "label": "إلى ألف مسكن",
                    "cost": 18.0
                },
                {
                    "label": "إلى الاربعه ونص",
                    "cost": 15.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 30.0
                },
                {
                    "label": "إلى الموقف + إلى اول عباس+ حلميه",
                    "cost": 70.0
                },
                {
                    "label": "إلى الفرع + إلى الشركه",
                    "cost": 155.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "تلا - قضاة طنطا - الفاتح - قطور",
        "route": {
            "legs": [
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى عبود",
                    "cost": 18.0
                },
                {
                    "label": "إلى تلا",
                    "cost": 80.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 28.0
                },
                {
                    "label": "إلى نادى القضاة",
                    "cost": 60.0
                },
                {
                    "label": "إلى الفاتح",
                    "cost": 60.0
                },
                {
                    "label": "إلى سبرباى",
                    "cost": 18.0
                },
                {
                    "label": "إلى قطور",
                    "cost": 25.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 35.0
                },
                {
                    "label": "إلى الموقف",
                    "cost": 35.0
                },
                {
                    "label": "الى عبود",
                    "cost": 95.0
                },
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى العرب",
                    "cost": 18.0
                }
            ],
            "allowance": 150.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك العقاري",
        "address": "عريش",
        "route": {
            "legs": [
                {
                    "label": "الي المرج",
                    "cost": 20.0
                },
                {
                    "label": "عريش",
                    "cost": 370.0
                },
                {
                    "label": "الي فرع",
                    "cost": 65.0
                },
                {
                    "label": "الي موقف",
                    "cost": 70.0
                },
                {
                    "label": "القاهره",
                    "cost": 370.0
                },
                {
                    "label": "معادي",
                    "cost": 20.0
                }
            ],
            "allowance": 250.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "منيل شيحة - العياط - الحوامدية - البدرشين",
        "route": {
            "legs": [
                {
                    "label": "الي منيب",
                    "cost": 15.0
                },
                {
                    "label": "الي فرع منيل",
                    "cost": 13.0
                },
                {
                    "label": "الي فرع حوامديه",
                    "cost": 13.0
                },
                {
                    "label": "الي بدرشين",
                    "cost": 13.0
                },
                {
                    "label": "الي الفرع",
                    "cost": 35.0
                },
                {
                    "label": "الي الختم",
                    "cost": 35.0
                },
                {
                    "label": "الي عياط",
                    "cost": 28.0
                },
                {
                    "label": "الي حومديه",
                    "cost": 28.0
                },
                {
                    "label": "الي منيب",
                    "cost": 15.0
                },
                {
                    "label": "الي معادي",
                    "cost": 15.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "جنوب الوادي - البطراوي -  وادي النيل",
        "route": {
            "legs": [
                {
                    "label": "الي الموقف الجديد",
                    "cost": 18.0
                },
                {
                    "label": "الي مدينه نصر",
                    "cost": 35.0
                },
                {
                    "label": "الي فرع بطراوي",
                    "cost": 35.0
                },
                {
                    "label": "الي فرع جنوب الوادي",
                    "cost": 45.0
                },
                {
                    "label": "الي طريق",
                    "cost": 30.0
                },
                {
                    "label": "الي مستشفي وادي النيل",
                    "cost": 20.0
                },
                {
                    "label": "الي مترو",
                    "cost": 50.0
                },
                {
                    "label": "الي معادي",
                    "cost": 17.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "الهيئة الاقتصادية قناة السويس",
        "route": {
            "legs": [
                {
                    "label": "الي موقف الجديد",
                    "cost": 18.0
                },
                {
                    "label": "الي سلام",
                    "cost": 32.0
                },
                {
                    "label": "من السلام الي العين السخنة",
                    "cost": 150.0
                },
                {
                    "label": "الي الفرع",
                    "cost": 80.0
                },
                {
                    "label": "الي طريق استيلا",
                    "cost": 160.0
                },
                {
                    "label": "الي الموقف",
                    "cost": 80.0
                },
                {
                    "label": "الي المرج",
                    "cost": 150.0
                },
                {
                    "label": "الي المعادي",
                    "cost": 20.0
                }
            ],
            "allowance": 150.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "محي الدين  -  محمد مظهر - الجزيرة  - نادي البنك -  امبابه",
        "route": {
            "legs": [
                {
                    "label": "إلى الاوبرا",
                    "cost": 17.0
                },
                {
                    "label": "إلى الجزيره",
                    "cost": 17.0
                },
                {
                    "label": "إلى محمد مظهر",
                    "cost": 45.0
                },
                {
                    "label": "إلى نادى البنك",
                    "cost": 45.0
                },
                {
                    "label": "إلى امبابه",
                    "cost": 18.0
                },
                {
                    "label": "إلى الختم",
                    "cost": 35.0
                },
                {
                    "label": "إلى محى الدين",
                    "cost": 35.0
                },
                {
                    "label": "إلى التحرير",
                    "cost": 18.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "الاوتستراد- حي الاسمرات - المنيرة",
        "route": {
            "legs": [
                {
                    "label": "إلى السيده",
                    "cost": 18.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 30.0
                },
                {
                    "label": "إلى السيده عائشه",
                    "cost": 30.0
                },
                {
                    "label": "إلى المقطم",
                    "cost": 19.0
                },
                {
                    "label": "إلى السيده",
                    "cost": 19.0
                },
                {
                    "label": "إلى الاستيراد",
                    "cost": 18.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 35.0
                },
                {
                    "label": "إلى الختم",
                    "cost": 40.0
                },
                {
                    "label": "إلى صقر",
                    "cost": 35.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "نبروة - شربين",
        "route": {
            "legs": [
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى عبود",
                    "cost": 18.0
                },
                {
                    "label": "إلى شربين",
                    "cost": 100.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 40.0
                },
                {
                    "label": "إلى الموقف",
                    "cost": 40.0
                },
                {
                    "label": "إلى المنصوره",
                    "cost": 25.0
                },
                {
                    "label": "إلى نبروه",
                    "cost": 18.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 40.0
                },
                {
                    "label": "إلى الموقف",
                    "cost": 40.0
                },
                {
                    "label": "إلى المنصوره",
                    "cost": 18.0
                },
                {
                    "label": "إلى القاهرة",
                    "cost": 105.0
                },
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى العرب",
                    "cost": 18.0
                }
            ],
            "allowance": 120.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "جمصه",
        "route": {
            "legs": [
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى عبود",
                    "cost": 18.0
                },
                {
                    "label": "إلى جمصه",
                    "cost": 145.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 70.0
                },
                {
                    "label": "إلى الكارته",
                    "cost": 70.0
                },
                {
                    "label": "إلى المنصوره",
                    "cost": 60.0
                },
                {
                    "label": "إلى القاهرة",
                    "cost": 115.0
                },
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "الى صقر",
                    "cost": 18.0
                }
            ],
            "allowance": 110.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "اسكندرية: لوران- المنتزه- وسط الاسكندرية- جرين بلازا- سابا باشا- سموحة",
        "route": {
            "legs": [
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى اسكندريه",
                    "cost": 215.0
                },
                {
                    "label": "إلى فرع وسط المدينة",
                    "cost": 15.0
                },
                {
                    "label": "إلى فرع سابا باشا",
                    "cost": 21.0
                },
                {
                    "label": "إلى لوران",
                    "cost": 95.0
                },
                {
                    "label": "إلى المنتزه",
                    "cost": 120.0
                },
                {
                    "label": "إلى الابراهيميه",
                    "cost": 25.0
                },
                {
                    "label": "إلى سموحه",
                    "cost": 14.0
                },
                {
                    "label": "جرين بلازا",
                    "cost": 18.0
                },
                {
                    "label": "إلى المواقف",
                    "cost": 15.0
                },
                {
                    "label": "إلى القاهرة",
                    "cost": 215.0
                },
                {
                    "label": "إلى صقر",
                    "cost": 18.0
                }
            ],
            "allowance": 200.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "قنطرة غرب",
        "route": {
            "legs": [
                {
                    "label": "إلى المرج",
                    "cost": 20.0
                },
                {
                    "label": "إلى قنطره",
                    "cost": 115.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 45.0
                },
                {
                    "label": "إلى الموقف",
                    "cost": 45.0
                },
                {
                    "label": "إلى المرج",
                    "cost": 115.0
                },
                {
                    "label": "إلى رمسيس",
                    "cost": 20.0
                },
                {
                    "label": "إلى الزمالك",
                    "cost": 20.0
                },
                {
                    "label": "إلى رمسيس",
                    "cost": 20.0
                },
                {
                    "label": "إلى التحرير",
                    "cost": 12.0
                },
                {
                    "label": "إلى العرب",
                    "cost": 18.0
                }
            ],
            "allowance": 110.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "كفر الدوار - العامرية",
        "route": {
            "legs": [
                {
                    "label": "إلى رمسيس",
                    "cost": 18.0
                },
                {
                    "label": "إلى عامريه",
                    "cost": 200.0
                },
                {
                    "label": "إلى الموقف",
                    "cost": 30.0
                },
                {
                    "label": "إلى كفر الدوار",
                    "cost": 45.0
                },
                {
                    "label": "إلى الفرع",
                    "cost": 40.0
                },
                {
                    "label": "إلى الموقف",
                    "cost": 40.0
                },
                {
                    "label": "إلى اسكندريه",
                    "cost": 32.0
                },
                {
                    "label": "إلى القاهرة",
                    "cost": 200.0
                },
                {
                    "label": "إلى العرب",
                    "cost": 18.0
                }
            ],
            "allowance": 130.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "شروق",
        "route": {
            "legs": [
                {
                    "label": "الي موقف الجديد",
                    "cost": 18.0
                },
                {
                    "label": "الي سلام",
                    "cost": 32.0
                },
                {
                    "label": "الي بوابت الشروق",
                    "cost": 20.0
                },
                {
                    "label": "الي فرع",
                    "cost": 50.0
                },
                {
                    "label": "الي موقف",
                    "cost": 60.0
                },
                {
                    "label": "الي سلام",
                    "cost": 28.0
                },
                {
                    "label": "الي صقر",
                    "cost": 28.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "الثلاثيني - المنيب - الرقيب",
        "route": {
            "legs": [
                {
                    "label": "الي الجيزه",
                    "cost": 20.0
                },
                {
                    "label": "الي فرع منيب الاكتروني",
                    "cost": 40.0
                },
                {
                    "label": "الي الختم",
                    "cost": 40.0
                },
                {
                    "label": "الي مترو ام المصرين",
                    "cost": 45.0
                },
                {
                    "label": "الي فرع تلاتيني",
                    "cost": 17.0
                },
                {
                    "label": "الي ختم",
                    "cost": 50.0
                },
                {
                    "label": "الي فرع الرقيب",
                    "cost": 16.0
                },
                {
                    "label": "الي موقف الهرم",
                    "cost": 25.0
                },
                {
                    "label": "الي مطبعه",
                    "cost": 20.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "ارشيف حلوان-جوهر القائد -  المعادي -مبيعات ثروت-عمر افندي",
        "route": {
            "legs": [
                {
                    "label": "الي المشيخه",
                    "cost": 18.0
                },
                {
                    "label": "الي مبعات ثروت",
                    "cost": 15.0
                },
                {
                    "label": "الي حلوان",
                    "cost": 20.0
                },
                {
                    "label": "الي فرع ارشيف حلوان",
                    "cost": 40.0
                },
                {
                    "label": "الي الختم",
                    "cost": 50.0
                },
                {
                    "label": "الي الفرع",
                    "cost": 50.0
                },
                {
                    "label": "الي مترو",
                    "cost": 40.0
                },
                {
                    "label": "الي معادي",
                    "cost": 18.0
                },
                {
                    "label": "الي فرع المعادي",
                    "cost": 40.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "المنيا الجديدة-سمالوط-الخارجه",
        "route": {
            "legs": [
                {
                    "label": "الي جيزه",
                    "cost": 18.0
                },
                {
                    "label": "الي منيب",
                    "cost": 25.0
                },
                {
                    "label": "الي سمالوط",
                    "cost": 230.0
                },
                {
                    "label": "الي موقف سمالوط",
                    "cost": 50.0
                },
                {
                    "label": "الي منيا صناعيه",
                    "cost": 25.0
                },
                {
                    "label": "الي فرع",
                    "cost": 25.0
                },
                {
                    "label": "الي منيا",
                    "cost": 22.0
                },
                {
                    "label": "الي موقف",
                    "cost": 50.0
                },
                {
                    "label": "الي اسيوط",
                    "cost": 160.0
                },
                {
                    "label": "الي الخارجه",
                    "cost": 185.0
                }
            ],
            "allowance": 0.0,
            "lodging": 650.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "سوهاج و دشنا",
        "route": {
            "legs": [
                {
                    "label": "الي الموقف",
                    "cost": 12.0
                },
                {
                    "label": "الي اخميم",
                    "cost": 15.0
                },
                {
                    "label": "الي محافظه",
                    "cost": 15.0
                },
                {
                    "label": "موقف ساقلته",
                    "cost": 18.0
                },
                {
                    "label": "الي ساقلته",
                    "cost": 28.0
                },
                {
                    "label": "الي الفرع",
                    "cost": 45.0
                },
                {
                    "label": "الي موقف",
                    "cost": 45.0
                },
                {
                    "label": "سوهاج",
                    "cost": 28.0
                },
                {
                    "label": "الي الموقف",
                    "cost": 50.0
                },
                {
                    "label": "الي قنا",
                    "cost": 160.0
                },
                {
                    "label": "الي دشنا",
                    "cost": 40.0
                },
                {
                    "label": "الي الفرع",
                    "cost": 45.0
                },
                {
                    "label": "الي موقف دشنا",
                    "cost": 40.0
                }
            ],
            "allowance": 0.0,
            "lodging": 0.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "نادي قضاة اسيوط- العقاري",
        "route": {
            "legs": [
                {
                    "label": "الي موقف الخارجه",
                    "cost": 60.0
                },
                {
                    "label": "الي سيمكس اسيوط",
                    "cost": 185.0
                },
                {
                    "label": "الي اسيوط",
                    "cost": 70.0
                },
                {
                    "label": "الي نادي قضاء",
                    "cost": 40.0
                },
                {
                    "label": "الي بنك عقاري",
                    "cost": 40.0
                },
                {
                    "label": "الي موقف المعالمين",
                    "cost": 50.0
                },
                {
                    "label": "الي سوهاج",
                    "cost": 155.0
                }
            ],
            "allowance": 0.0,
            "lodging": 662.0
        }
    },
    {
        "company": "البنك الأهلي",
        "address": "اسوان الكورنيش-اسوان الجديدة-اسنا",
        "route": {
            "legs": [
                {
                    "label": "الي قنا",
                    "cost": 40.0
                },
                {
                    "label": "الي موقف الاقاليم",
                    "cost": 45.0
                },
                {
                    "label": "الي اسوان",
                    "cost": 230.0
                },
                {
                    "label": "الي فرع كورنيش",
                    "cost": 15.0
                },
                {
                    "label": "الي موقف الاقاليم",
                    "cost": 15.0
                },
                {
                    "label": "الي اسوان الجديده",
                    "cost": 24.0
                },
                {
                    "label": "الي موقف الاقاليم",
                    "cost": 24.0
                },
                {
                    "label": "الي اسنا",
                    "cost": 140.0
                },
                {
                    "label": "الي فرع",
                    "cost": 40.0
                },
                {
                    "label": "الي موقف",
                    "cost": 40.0
                },
                {
                    "label": "الي القاهره",
                    "cost": 600.0
                }
            ],
            "allowance": 0.0,
            "lodging": 920.0
        }
    }
]
JSON;
}
