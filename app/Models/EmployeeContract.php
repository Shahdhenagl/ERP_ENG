<?php

namespace App\Models;

use App\Models\Concerns\HasAttachments;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeContract extends Model
{
    use HasAttachments, HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'employee_id', 'title', 'contract_type', 'starts_on', 'ends_on',
        'salary', 'notes', 'status', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'salary' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $contract): void {
            $contract->code ??= 'EC-'.now()->format('Y').'-'.str_pad((string) ((static::withTrashed()->max('id') ?? 0) + 1), 5, '0', STR_PAD_LEFT);
        });
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function typeLabel(): string
    {
        return match ($this->contract_type) {
            'full_time' => 'دوام كامل',
            'part_time' => 'دوام جزئي',
            'fixed_term' => 'محدد المدة',
            'indefinite' => 'غير محدد المدة',
            'consultant' => 'استشاري',
            default => $this->contract_type,
        };
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'draft' => 'مسودة',
            'active' => 'ساري',
            'expired' => 'منتهي',
            'terminated' => 'منهى',
            default => $this->status,
        };
    }
}
