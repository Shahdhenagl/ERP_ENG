<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    /**
     * Readable by anyone signed in: the letterhead appears on documents a
     * technician prints on site, so gating it behind admin would leave their
     * copy of a service report unbranded.
     */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Setting::values()]);
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
            'default_tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        Setting::put(array_map(fn ($value) => $value === null ? '' : (string) $value, $data));

        ActivityLog::record('settings.updated', null, 'تم تحديث بيانات الشركة');

        return response()->json(['data' => Setting::values()]);
    }
}
