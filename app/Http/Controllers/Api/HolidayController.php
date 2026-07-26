<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Holiday;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The official-holiday calendar the maintenance planner steps its visits over.
 * Read by anyone signed in; only the admin edits it.
 */
class HolidayController extends Controller
{
    public function index(): JsonResponse
    {
        $holidays = Holiday::query()
            ->orderBy('date')
            ->get()
            ->map(fn (Holiday $h) => [
                'id' => $h->id,
                'date' => $h->date->toDateString(),
                'name' => $h->name,
            ]);

        return response()->json(['data' => $holidays]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date', 'unique:holidays,date'],
            'name' => ['nullable', 'string', 'max:120'],
        ]);

        $holiday = Holiday::create($data);

        return response()->json([
            'data' => ['id' => $holiday->id, 'date' => $holiday->date->toDateString(), 'name' => $holiday->name],
        ], 201);
    }

    public function destroy(Holiday $holiday): JsonResponse
    {
        $holiday->delete();

        return response()->json(['deleted' => true]);
    }
}
