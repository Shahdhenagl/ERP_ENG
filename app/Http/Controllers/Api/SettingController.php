<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    /**
     * Readable by anyone signed in: the letterhead appears on documents a
     * technician prints on site, so gating it behind admin would leave their
     * copy of a service report unbranded.
     */
    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->payload()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_name' => ['required', 'string', 'max:120'],
            'company_tagline' => ['nullable', 'string', 'max:160'],
            'company_phone' => ['nullable', 'string', 'max:64'],
            'company_email' => ['nullable', 'email', 'max:160'],
            'company_address' => ['nullable', 'string', 'max:500'],
            'company_tax_id' => ['nullable', 'string', 'max:32'],
            'company_commercial_id' => ['nullable', 'string', 'max:32'],
            'invoice_footer' => ['nullable', 'string', 'max:1000'],
            'quotation_terms' => ['nullable', 'string', 'max:2000'],
            'quotation_conditions' => ['nullable', 'string', 'max:2000'],
            'default_tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        Setting::put(array_map(fn ($value) => $value === null ? '' : (string) $value, $data));

        ActivityLog::record('settings.updated', null, 'تم تحديث بيانات الشركة');

        return response()->json(['data' => $this->payload()]);
    }

    /**
     * The company seal, uploaded once and stamped on approved documents.
     *
     * Stored as a file rather than pasted into the settings row: a seal is a
     * few hundred kilobytes of image, and settings are read on every document
     * a technician opens in the field.
     */
    public function uploadStamp(Request $request): JsonResponse
    {
        $request->validate([
            // PNG for the transparency a seal needs to sit over a signature
            // line; the rest are accepted so nobody is stopped by a format.
            'stamp' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
        ]);

        $previous = Setting::get('company_stamp');

        $path = $request->file('stamp')->store('brand', 'public');

        Setting::put(['company_stamp' => $path]);

        // Replacing a seal leaves the old file orphaned otherwise, and a seal
        // is exactly the file that should not linger on a shared host.
        if ($previous && $previous !== $path) {
            Storage::disk('public')->delete($previous);
        }

        ActivityLog::record('settings.stamp', null, 'تم تحديث ختم الشركة');

        return response()->json(['data' => $this->payload()]);
    }

    public function deleteStamp(): JsonResponse
    {
        if ($path = Setting::get('company_stamp')) {
            Storage::disk('public')->delete($path);
        }

        Setting::put(['company_stamp' => '']);

        ActivityLog::record('settings.stamp', null, 'تم حذف ختم الشركة');

        return response()->json(['data' => $this->payload()]);
    }

    /**
     * Settings as a screen needs them: the stored values, plus a URL for the
     * stamp. The row holds a disk path, and no screen should have to know how
     * the public disk is mounted to turn one into an image.
     *
     * @return array<string, mixed>
     */
    protected function payload(): array
    {
        $values = Setting::values();
        $stamp = $values['company_stamp'] ?? '';

        $values['company_stamp_url'] = $stamp ? Storage::disk('public')->url($stamp) : '';

        return $values;
    }
}
