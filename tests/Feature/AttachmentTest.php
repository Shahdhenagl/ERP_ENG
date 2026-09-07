<?php

use App\Models\Attachment;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\SiteSurvey;
use App\Models\Tender;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    Storage::fake('public');
    $this->manager = User::factory()->manager()->create();
    $this->survey = SiteSurvey::create(['status' => 'draft']);
});

it('uploads a photo and links it to the record', function () {
    $response = actingAs($this->manager)
        ->postJson("/api/attachments/site-surveys/{$this->survey->id}", [
            'files' => [UploadedFile::fake()->image('site.jpg')],
            'caption' => 'لوحة التوزيع',
        ])
        ->assertCreated();

    $row = $response->json('data.0');
    expect($row['is_image'])->toBeTrue()
        ->and($row['caption'])->toBe('لوحة التوزيع')
        ->and($this->survey->attachments()->count())->toBe(1);

    Storage::disk('public')->assertExists($this->survey->attachments()->first()->path);
});

it('attaches the signed contract document to a contract', function () {
    $contract = Contract::factory()->create(['customer_id' => Customer::factory()]);

    actingAs($this->manager)
        ->post("/api/attachments/contracts/{$contract->id}", [
            'files' => [UploadedFile::fake()->create('contract.pdf', 200, 'application/pdf')],
            'caption' => 'العقد الموقّع',
        ])
        ->assertCreated();

    expect($contract->attachments()->count())->toBe(1)
        ->and($contract->attachments()->first()->caption)->toBe('العقد الموقّع');
});

it('uploads employee contract photos and documents', function () {
    $employee = Employee::factory()->create();
    $contract = EmployeeContract::create([
        'employee_id' => $employee->id,
        'title' => 'عقد الموظف',
        'type' => 'fixed_term',
        'starts_on' => now()->toDateString(),
        'agreed_salary' => 7000,
        'salary_basis_days' => 30,
        'status' => 'active',
    ]);

    actingAs($this->manager)
        ->postJson("/api/attachments/employee-contracts/{$contract->id}", [
            'files' => [
                UploadedFile::fake()->image('signed-contract.jpg'),
                UploadedFile::fake()->create('signed-contract.pdf', 200, 'application/pdf'),
            ],
            'caption' => 'العقد الموقّع',
        ])
        ->assertCreated();

    expect($contract->attachments()->count())->toBe(2)
        ->and($contract->attachments()->where('mime', 'image/jpeg')->exists())->toBeTrue()
        ->and($contract->attachments()->where('mime', 'application/pdf')->exists())->toBeTrue();
});

it('lists the files on a record', function () {
    actingAs($this->manager)->postJson("/api/attachments/site-surveys/{$this->survey->id}", [
        'files' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->create('spec.pdf', 100, 'application/pdf')],
    ])->assertCreated();

    $rows = actingAs($this->manager)
        ->getJson("/api/attachments/site-surveys/{$this->survey->id}")
        ->assertOk()
        ->json('data');

    expect($rows)->toHaveCount(2);
});

it('deletes a file and removes it from disk', function () {
    actingAs($this->manager)->postJson("/api/attachments/site-surveys/{$this->survey->id}", [
        'files' => [UploadedFile::fake()->image('a.jpg')],
    ])->assertCreated();

    $attachment = $this->survey->attachments()->first();

    actingAs($this->manager)->deleteJson("/api/attachments/{$attachment->id}")->assertOk();

    Storage::disk('public')->assertMissing($attachment->path);
    expect(Attachment::count())->toBe(0);
});

it('rejects a disallowed file type', function () {
    actingAs($this->manager)->postJson("/api/attachments/site-surveys/{$this->survey->id}", [
        'files' => [UploadedFile::fake()->create('malware.exe', 10)],
    ])->assertStatus(422);
});

it('guards each kind by its own permission', function () {
    // A manager without sales.manage still reaches surveys (crm.manage) but a
    // technician is barred from both.
    $technician = User::factory()->technician()->create();

    actingAs($technician)->getJson("/api/attachments/site-surveys/{$this->survey->id}")
        ->assertForbidden();

    $tender = Tender::create(['entity' => 'ج', 'title' => 'م']);
    actingAs($technician)->getJson("/api/attachments/tenders/{$tender->id}")
        ->assertForbidden();
});

it('404s an unknown attachable kind', function () {
    actingAs($this->manager)->getJson('/api/attachments/widgets/1')->assertNotFound();
});
