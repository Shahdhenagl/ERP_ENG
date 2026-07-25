<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaskReport extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'user_id',
        'type',
        'input_voltage',
        'input_voltage_l2',
        'input_voltage_l3',
        'output_voltage',
        'output_voltage_l2',
        'output_voltage_l3',
        'frequency',
        'load_percent',
        'battery_voltage',
        'temperature',
        'backup_minutes',
        'device_condition',
        'batteries_need_replacement',
        'check_earthing',
        'check_environment',
        'check_charger',
        'check_accessories',
        'findings',
        'actions_taken',
        'recommendations',
        'parts_used',
        'signature_path',
        'signed_by_name',
        'signed_at',
    ];

    protected function casts(): array
    {
        return [
            'input_voltage' => 'float',
            'input_voltage_l2' => 'float',
            'input_voltage_l3' => 'float',
            'output_voltage' => 'float',
            'output_voltage_l2' => 'float',
            'output_voltage_l3' => 'float',
            'frequency' => 'float',
            'load_percent' => 'float',
            'battery_voltage' => 'float',
            'temperature' => 'float',
            'backup_minutes' => 'integer',
            'batteries_need_replacement' => 'boolean',
            'parts_used' => 'array',
            'signed_at' => 'datetime',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(TaskAttachment::class);
    }
}
