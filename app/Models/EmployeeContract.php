<?php

namespace App\Models;

use App\Models\Concerns\HasAttachments;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeContract extends Model
{
    use HasAttachments, SoftDeletes;

    protected $fillable = [
        'code', 'employee_id', 'title', 'type', 'starts_on', 'ends_on',
        'agreed_salary', 'salary_basis_days', 'status', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'agreed_salary' => 'decimal:2',
            'salary_basis_days' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $contract): void {
            $contract->code ??= sprintf(
                'EC-%d-%04d',
                now()->year,
                static::withTrashed()->whereYear('created_at', now()->year)->count() + 1,
            );
        });
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
