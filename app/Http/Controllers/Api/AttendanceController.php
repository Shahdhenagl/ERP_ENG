<?php

namespace App\Http\Controllers\Api;

use App\Enums\AttendanceStatus;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Attendance;
use App\Models\Employee;
use App\Support\Terms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class AttendanceController extends Controller
{
    /** A day's records, defaulting to the current month unless narrowed. */
    public function index(Request $request): JsonResponse
    {
        $year = $request->integer('year') ?: (int) now()->year;
        $month = $request->integer('month') ?: (int) now()->month;

        $records = Attendance::query()
            ->forMonth($year, $month)
            ->when($request->integer('employee_id'), fn ($q, $id) => $q->where('employee_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->date('date'), fn ($q, $date) => $q->whereDate('date', $date))
            ->with(['employee', 'recorder'])
            ->orderByDesc('date')
            ->orderBy('employee_id')
            ->get();

        return response()->json([
            'data' => $records->map(fn (Attendance $a) => $this->present($a))->values(),
            'meta' => ['year' => $year, 'month' => $month],
        ]);
    }

    /**
     * Record a day, or correct one already recorded. The unique employee-date
     * key turns a second write into an update rather than a duplicate.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $attendance = Attendance::updateOrCreate(
            ['employee_id' => $data['employee_id'], 'date' => $data['date']],
            [...$data, 'recorded_by' => $request->user()->id],
        );

        ActivityLog::record(
            'attendance.recorded',
            $attendance,
            "حضور {$attendance->employee?->name} — {$attendance->statusLabel()}",
        );

        return response()->json(['data' => $this->present($attendance->load(['employee', 'recorder']))], 201);
    }

    public function update(Request $request, Attendance $attendance): JsonResponse
    {
        $data = $this->validated($request, moving: false);

        $attendance->update([...$data, 'recorded_by' => $request->user()->id]);

        return response()->json(['data' => $this->present($attendance->load(['employee', 'recorder']))]);
    }

    public function destroy(Attendance $attendance): JsonResponse
    {
        $attendance->delete();

        return response()->json(['data' => true]);
    }

    /* ── Technician self-service ─────────────────────────────── */

    /** The signed-in technician's record for today, or null before they punch. */
    public function mineToday(Request $request): JsonResponse
    {
        $employee = Employee::firstWhere('user_id', $request->user()->id);

        $record = $employee
            ? Attendance::where('employee_id', $employee->id)->whereDate('date', today())->first()
            : null;

        return response()->json(['data' => $record ? $this->present($record) : null]);
    }

    /**
     * Punch in from the field, stamping where. One check-in a day — a second is
     * refused rather than overwriting the first, which is the honest time.
     */
    public function checkIn(Request $request): JsonResponse
    {
        $data = $this->locationRules($request);
        $employee = Employee::forUser($request->user());
        $today = now()->toDateString();

        $existing = Attendance::where('employee_id', $employee->id)->whereDate('date', $today)->first();

        if ($existing && $existing->check_in) {
            throw ValidationException::withMessages(['check_in' => Terms::get('تم تسجيل حضورك اليوم بالفعل.')]);
        }

        $attendance = Attendance::updateOrCreate(
            ['employee_id' => $employee->id, 'date' => $today],
            [
                'status' => 'present',
                'check_in' => now()->format('H:i'),
                'check_in_lat' => $data['lat'] ?? null,
                'check_in_lng' => $data['lng'] ?? null,
                'recorded_by' => $request->user()->id,
            ],
        );

        ActivityLog::record('attendance.check_in', $attendance, "تسجيل حضور {$employee->name}");

        return response()->json(['data' => $this->present($attendance)], 201);
    }

    /** Punch out, stamping where. Refused until they have punched in. */
    public function checkOut(Request $request): JsonResponse
    {
        $data = $this->locationRules($request);
        $employee = Employee::forUser($request->user());

        $attendance = Attendance::where('employee_id', $employee->id)
            ->whereDate('date', now()->toDateString())
            ->first();

        if (! $attendance || ! $attendance->check_in) {
            throw ValidationException::withMessages(['check_out' => Terms::get('سجّل حضورك أولًا قبل الانصراف.')]);
        }

        if ($attendance->check_out) {
            throw ValidationException::withMessages(['check_out' => Terms::get('تم تسجيل انصرافك اليوم بالفعل.')]);
        }

        $attendance->update([
            'check_out' => now()->format('H:i'),
            'check_out_lat' => $data['lat'] ?? null,
            'check_out_lng' => $data['lng'] ?? null,
            'recorded_by' => $request->user()->id,
        ]);

        ActivityLog::record('attendance.check_out', $attendance, "تسجيل انصراف {$employee->name}");

        return response()->json(['data' => $this->present($attendance->fresh())]);
    }

    /** @return array<string, mixed> */
    protected function locationRules(Request $request): array
    {
        return $request->validate([
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
        ]);
    }

    /**
     * The month at a glance: a line per employee with the days attended, late,
     * absent and on leave, and the hours the attendance actually added up to.
     */
    public function summary(Request $request): JsonResponse
    {
        $year = $request->integer('year') ?: (int) now()->year;
        $month = $request->integer('month') ?: (int) now()->month;

        $byEmployee = Attendance::query()
            ->forMonth($year, $month)
            ->with('employee')
            ->get()
            ->groupBy('employee_id');

        $rows = $byEmployee
            ->map(function ($records) {
                $employee = $records->first()->employee;

                return [
                    'employee_id' => $employee?->id,
                    'employee' => $employee?->name,
                    'employee_code' => $employee?->code,
                    'department' => $employee?->department,
                    'present_days' => $records->where('status', AttendanceStatus::Present)->count(),
                    'late_days' => $records->where('status', AttendanceStatus::Late)->count(),
                    'absent_days' => $records->where('status', AttendanceStatus::Absent)->count(),
                    'leave_days' => $records->where('status', AttendanceStatus::Leave)->count(),
                    'holiday_days' => $records->where('status', AttendanceStatus::Holiday)->count(),
                    'attended_days' => $records->filter(fn (Attendance $a) => $a->status->isAttended())->count(),
                    'late_minutes' => (int) $records->sum('late_minutes'),
                    'worked_hours' => round((float) $records->sum('worked_hours'), 2),
                ];
            })
            ->sortBy('employee')
            ->values();

        return response()->json([
            'data' => $rows,
            'meta' => ['year' => $year, 'month' => $month],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validated(Request $request, bool $moving = true): array
    {
        return $request->validate([
            'employee_id' => [$moving ? 'required' : 'sometimes', 'exists:employees,id'],
            'date' => [$moving ? 'required' : 'sometimes', 'date'],
            'status' => ['required', 'in:present,late,absent,leave,holiday'],
            'check_in' => ['nullable', 'date_format:H:i'],
            'check_out' => ['nullable', 'date_format:H:i', 'after_or_equal:check_in'],
            'late_minutes' => ['nullable', 'integer', 'min:0', 'max:1440'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
    }

    /** @return array<string, mixed> */
    protected function present(Attendance $a): array
    {
        return [
            'id' => $a->id,
            'employee_id' => $a->employee_id,
            'employee' => $a->employee?->name,
            'employee_code' => $a->employee?->code,

            'date' => $a->date instanceof Carbon ? $a->date->toDateString() : (string) $a->date,
            'status' => $a->status->value,
            'status_label' => $a->statusLabel(),

            'check_in' => $a->check_in ? substr((string) $a->check_in, 0, 5) : null,
            'check_out' => $a->check_out ? substr((string) $a->check_out, 0, 5) : null,
            'check_in_lat' => $a->check_in_lat,
            'check_in_lng' => $a->check_in_lng,
            'check_out_lat' => $a->check_out_lat,
            'check_out_lng' => $a->check_out_lng,
            'late_minutes' => (int) $a->late_minutes,
            'worked_hours' => (float) $a->worked_hours,

            'note' => $a->note,
            'recorded_by' => $a->recorder?->name,
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }
}
