<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Contact;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ContactController extends Controller
{
    /** Every contact, for a directory that spans customers. */
    public function index(Request $request): JsonResponse
    {
        $contacts = Contact::query()
            ->search($request->string('search')->toString())
            ->when($request->integer('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->with('customer')
            // The primary first, then by name — a directory reads as the org chart.
            ->orderBy('customer_id')
            ->orderByDesc('is_primary')
            ->orderBy('name')
            ->get()
            ->map(fn (Contact $contact) => $this->present($contact));

        return response()->json(['data' => $contacts]);
    }

    /** The contacts of one customer — what the customer screen lists. */
    public function forCustomer(Customer $customer): JsonResponse
    {
        $contacts = $customer->contacts()
            ->orderByDesc('is_primary')
            ->orderBy('name')
            ->get()
            ->map(fn (Contact $contact) => $this->present($contact));

        return response()->json(['data' => $contacts]);
    }

    public function store(Request $request, Customer $customer): JsonResponse
    {
        $data = $this->validated($request);

        $contact = DB::transaction(function () use ($customer, $data, $request) {
            $contact = $customer->contacts()->create([...$data, 'created_by' => $request->user()->id]);
            $this->settlePrimary($contact);

            return $contact;
        });

        ActivityLog::record(
            'contact.created',
            $contact,
            "تم إضافة جهة اتصال {$contact->name} للعميل {$customer->name}",
        );

        return response()->json(['data' => $this->present($contact->load('customer'))], 201);
    }

    public function update(Request $request, Contact $contact): JsonResponse
    {
        $data = $this->validated($request);

        DB::transaction(function () use ($contact, $data) {
            $contact->update($data);
            $this->settlePrimary($contact);
        });

        ActivityLog::record('contact.updated', $contact, "تم تعديل جهة اتصال {$contact->name}");

        return response()->json(['data' => $this->present($contact->fresh()->load('customer'))]);
    }

    public function destroy(Contact $contact): JsonResponse
    {
        $name = $contact->name;
        $contact->delete();

        ActivityLog::record('contact.deleted', $contact, "تم حذف جهة اتصال {$name}");

        return response()->json(['message' => 'تم حذف جهة الاتصال.']);
    }

    /**
     * Keep one primary per customer. Marking a contact primary clears the flag
     * on the others, so "the customer's person" is never ambiguous.
     */
    protected function settlePrimary(Contact $contact): void
    {
        if (! $contact->is_primary) {
            return;
        }

        Contact::where('customer_id', $contact->customer_id)
            ->where('id', '!=', $contact->id)
            ->where('is_primary', true)
            ->update(['is_primary' => false]);
    }

    /** @return array<string, mixed> */
    protected function present(Contact $contact): array
    {
        return [
            'id' => $contact->id,
            'code' => $contact->code,
            'customer_id' => $contact->customer_id,
            'customer' => $contact->customer?->name,

            'name' => $contact->name,
            'job_title' => $contact->job_title,
            'department' => $contact->department,

            'phone' => $contact->phone,
            'whatsapp' => $contact->whatsapp,
            'email' => $contact->email,
            'contact_number' => $contact->contactNumber(),

            'is_primary' => $contact->is_primary,
            'is_active' => $contact->is_active,
            'notes' => $contact->notes,

            'created_at' => $contact->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'department' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:32'],
            'whatsapp' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'is_primary' => ['boolean'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }
}
