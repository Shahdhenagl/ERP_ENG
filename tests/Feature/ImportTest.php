<?php

use App\Models\Customer;
use App\Models\Item;
use App\Models\User;
use Illuminate\Http\UploadedFile;

use function Pest\Laravel\actingAs;

/**
 * Bulk import: a filled template becomes records, matched on a natural key so a
 * re-upload updates rather than duplicates, and guarded by the module it writes.
 */
beforeEach(function () {
    $this->manager = User::factory()->manager()->create();
    $this->technician = User::factory()->technician()->create();
});

function csvFile(string $name, string $content): UploadedFile
{
    return UploadedFile::fake()->createWithContent($name, "\xEF\xBB\xBF".$content);
}

it('imports customers and matches the type from its Arabic label', function () {
    $csv = "الاسم,الاسم بالإنجليزية,الهاتف,الشركة,النوع,البريد,البطاقة الضريبية,السجل التجاري,المدينة,العنوان\n"
        ."بنك مصر,Banque Misr,01099999999,,بنك,,111-222,CR-1,القاهرة,وسط البلد\n";

    actingAs($this->manager)
        ->post('/api/imports/customers', ['file' => csvFile('customers.csv', $csv)])
        ->assertOk()
        ->assertJsonPath('data.created', 1);

    $customer = Customer::where('phone', '01099999999')->first();
    expect($customer)->not->toBeNull()
        ->and($customer->name)->toBe('بنك مصر')
        ->and($customer->name_en)->toBe('Banque Misr')
        ->and($customer->type)->toBe('bank')
        ->and($customer->tax_id)->toBe('111-222');
});

it('updates on re-import rather than duplicating', function () {
    $first = "الاسم,الهاتف\nبنك مصر,01099999999\n";
    actingAs($this->manager)->post('/api/imports/customers', ['file' => csvFile('c.csv', $first)])->assertOk();

    $second = "الاسم,الهاتف,المدينة\nبنك مصر المحدث,01099999999,الجيزة\n";
    actingAs($this->manager)
        ->post('/api/imports/customers', ['file' => csvFile('c.csv', $second)])
        ->assertOk()
        ->assertJsonPath('data.updated', 1)
        ->assertJsonPath('data.created', 0);

    expect(Customer::where('phone', '01099999999')->count())->toBe(1)
        ->and(Customer::where('phone', '01099999999')->first()->city)->toBe('الجيزة');
});

it('skips a row with no name and reports it', function () {
    $csv = "الاسم,الهاتف\n,01000000000\nعميل صحيح,01000000001\n";

    actingAs($this->manager)
        ->post('/api/imports/customers', ['file' => csvFile('c.csv', $csv)])
        ->assertOk()
        ->assertJsonPath('data.created', 1)
        ->assertJsonPath('data.skipped', 1);
});

it('imports spare-part items', function () {
    $csv = "الاسم,الكود,الفئة,الوحدة,حد الطلب\nبطارية 100 أمبير,,battery,قطعة,5\n";

    actingAs($this->manager)
        ->post('/api/imports/items', ['file' => csvFile('items.csv', $csv)])
        ->assertOk()
        ->assertJsonPath('data.created', 1);

    expect(Item::where('name', 'بطارية 100 أمبير')->exists())->toBeTrue();
});

it('keeps a technician from importing', function () {
    $csv = "الاسم,الهاتف\nعميل,01055555555\n";

    actingAs($this->technician)
        ->post('/api/imports/customers', ['file' => csvFile('c.csv', $csv)])
        ->assertForbidden();
});
