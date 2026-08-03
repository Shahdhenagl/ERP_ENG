<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use App\Models\Battery;
use App\Models\Contract;
use App\Models\SiteSurvey;
use App\Models\TechnicianMonthlyReport;
use App\Models\Tender;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Files on a record, one endpoint for every module that owns them.
 *
 * The URL segment names the kind of record; each kind carries the permission
 * that guards it, checked here rather than as route middleware because the
 * guard depends on which record is being reached. New attachable modules are a
 * line in the map, not a new controller.
 */
class AttachmentController extends Controller
{
    /**
     * segment => [model class, permission that guards this kind].
     *
     * @var array<string, array{0: class-string<Model>, 1: string}>
     */
    protected const TYPES = [
        'site-surveys' => [SiteSurvey::class, 'crm.manage'],
        'batteries' => [Battery::class, 'assets.manage'],
        'tenders' => [Tender::class, 'sales.manage'],
        'contracts' => [Contract::class, 'contracts.manage'],
        // The paperwork handed in with a technician's monthly report.
        'technician-reports' => [TechnicianMonthlyReport::class, 'hr.manage'],
    ];

    public function index(Request $request, string $type, int $id): JsonResponse
    {
        $subject = $this->subject($request, $type, $id);

        return response()->json([
            'data' => $subject->attachments()->with('uploader')->get()->map($this->present(...)),
        ]);
    }

    public function store(Request $request, string $type, int $id): JsonResponse
    {
        $subject = $this->subject($request, $type, $id);

        $request->validate([
            'files' => ['required', 'array', 'max:10'],
            'files.*' => ['file', 'max:10240', 'mimes:jpg,jpeg,png,webp,heic,pdf'],
            'caption' => ['nullable', 'string', 'max:500'],
        ]);

        $stored = [];

        foreach ($request->file('files') as $file) {
            $path = $file->store("attachments/{$type}/{$id}", 'public');

            $stored[] = $subject->attachments()->create([
                'user_id' => $request->user()->id,
                'path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'caption' => $request->string('caption')->toString() ?: null,
            ]);
        }

        return response()->json([
            'data' => collect($stored)->map(fn (Attachment $a) => $this->present($a->load('uploader'))),
        ], 201);
    }

    public function destroy(Request $request, Attachment $attachment): JsonResponse
    {
        // The permission comes from the kind of record the file hangs on, so a
        // tender document is guarded like a tender even on the shared route.
        $permission = collect(self::TYPES)
            ->first(fn ($entry) => $entry[0] === $attachment->attachable_type);

        abort_unless($permission && $request->user()->hasPermission($permission[1]), 403);

        Storage::disk('public')->delete($attachment->path);
        $attachment->delete();

        return response()->json(['message' => 'تم حذف المرفق.']);
    }

    /** Resolve the record from the URL, guarding by its kind's permission. */
    protected function subject(Request $request, string $type, int $id): Model
    {
        abort_unless(isset(self::TYPES[$type]), 404);

        [$class, $permission] = self::TYPES[$type];

        abort_unless($request->user()->hasPermission($permission), 403);

        return $class::findOrFail($id);
    }

    /** @return array<string, mixed> */
    protected function present(Attachment $attachment): array
    {
        return [
            'id' => $attachment->id,
            'url' => $attachment->url,
            'is_image' => $attachment->is_image,
            'original_name' => $attachment->original_name,
            'mime' => $attachment->mime,
            'size' => $attachment->size,
            'caption' => $attachment->caption,
            'uploader' => $attachment->uploader?->name,
            'created_at' => $attachment->created_at?->toIso8601String(),
        ];
    }
}
