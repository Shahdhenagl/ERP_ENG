<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Draft;
use App\Models\DraftCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DraftController extends Controller
{
    public function categories(): JsonResponse
    {
        return response()->json(['data' => DraftCategory::query()->withCount('drafts')->orderBy('sort_order')->orderBy('name')->get()]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:120', 'unique:draft_categories,name'], 'name_en' => ['nullable', 'string', 'max:120']]);
        return response()->json(['data' => DraftCategory::create($data)], 201);
    }

    public function updateCategory(Request $request, DraftCategory $draftCategory): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:120', Rule::unique('draft_categories', 'name')->ignore($draftCategory->id)], 'name_en' => ['nullable', 'string', 'max:120'], 'is_active' => ['boolean']]);
        $draftCategory->update($data);
        return response()->json(['data' => $draftCategory->fresh()->loadCount('drafts')]);
    }

    public function destroyCategory(DraftCategory $draftCategory): JsonResponse
    {
        abort_if($draftCategory->drafts()->exists(), 422, 'لا يمكن حذف تصنيف يحتوي على مسودات.');
        $draftCategory->delete();
        return response()->json(['message' => 'تم حذف التصنيف.']);
    }

    public function index(Request $request): JsonResponse
    {
        $drafts = Draft::query()->with('category')->when($request->integer('category_id'), fn ($q, $id) => $q->where('draft_category_id', $id))->when($request->string('search')->toString(), function ($q, $search) {
            $q->where(fn ($inner) => $inner->where('title', 'like', "%{$search}%")->orWhere('title_en', 'like', "%{$search}%"));
        })->latest('updated_at')->paginate(min($request->integer('per_page', 50), 100));
        return response()->json($drafts);
    }

    public function show(Draft $draft): JsonResponse
    {
        return response()->json(['data' => $draft->load('category')]);
    }

    public function store(Request $request): JsonResponse
    {
        $draft = DB::transaction(fn () => Draft::create($this->validated($request) + ['created_by' => $request->user()->id, 'updated_by' => $request->user()->id]));
        return response()->json(['data' => $draft->load('category')], 201);
    }

    public function update(Request $request, Draft $draft): JsonResponse
    {
        $draft->update($this->validated($request) + ['updated_by' => $request->user()->id]);
        return response()->json(['data' => $draft->fresh()->load('category')]);
    }

    public function destroy(Draft $draft): JsonResponse
    {
        $draft->delete();
        return response()->json(['message' => 'تم حذف المسودة.']);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'draft_category_id' => ['required', 'exists:draft_categories,id'],
            'title' => ['required', 'string', 'max:200'],
            'title_en' => ['nullable', 'string', 'max:200'],
            'content' => ['nullable', 'string'],
            'content_en' => ['nullable', 'string'],
            'font_size' => ['nullable', 'numeric', 'min:8', 'max:48'],
            'font_family' => ['nullable', 'string', 'max:80'],
            'text_color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'accent_color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'direction' => ['nullable', Rule::in(['rtl', 'ltr'])],
        ]);

        foreach (['content', 'content_en'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = strip_tags($data[$field], '<p><br><strong><b><em><i><u><s><ol><ul><li><h1><h2><h3><blockquote><div><span>');
            }
        }

        return $data;
    }
}
