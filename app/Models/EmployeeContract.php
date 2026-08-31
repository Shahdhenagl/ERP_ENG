<?php

namespace App\Models;

<<<<<<< HEAD
use App\Models\Concerns\HasAttachments;
use Illuminate\Database\Eloquent\Factories\HasFactory;
=======
>>>>>>> d65d303 (feat: improve permissions payroll and employee workflows)
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeContract extends Model
{
<<<<<<< HEAD
    use HasAttachments, HasFactory, SoftDeletes;

    protected $fillable = [
        'code', 'employee_id', 'title', 'contract_type', 'starts_on', 'ends_on',
        'salary', 'notes', 'status', 'created_by',
=======
    use SoftDeletes;

    protected $fillable = [
        'code', 'employee_id', 'title', 'type', 'starts_on', 'ends_on',
        'agreed_salary', 'salary_basis_days', 'status', 'notes', 'created_by',
>>>>>>> d65d303 (feat: improve permissions payroll and employee workflows)
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
<<<<<<< HEAD
            'salary' => 'decimal:2',
=======
            'agreed_salary' => 'decimal:2',
            'salary_basis_days' => 'integer',
>>>>>>> d65d303 (feat: improve permissions payroll and employee workflows)
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $contract): void {
<<<<<<< HEAD
            $contract->code ??= 'EC-'.now()->format('Y').'-'.str_pad((string) ((static::withTrashed()->max('id') ?? 0) + 1), 5, '0', STR_PAD_LEFT);
=======
            $contract->code ??= sprintf(
                'EC-%d-%04d',
                now()->year,
                static::withTrashed()->whereYear('created_at', now()->year)->count() + 1,
            );
>>>>>>> d65d303 (feat: improve permissions payroll and employee workflows)
        });
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
<<<<<<< HEAD

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
=======
>>>>>>> d65d303 (feat: improve permissions payroll and employee workflows)
}
