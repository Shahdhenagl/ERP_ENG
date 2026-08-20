<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InstallmentWorkflow extends Model
{
    use HasFactory;

    protected $fillable = [
        'contract_payment_id', 'workflow_template_id', 'status', 'completed_at', 'completed_by',
    ];

    protected function casts(): array
    {
        return ['completed_at' => 'datetime'];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(ContractPayment::class, 'contract_payment_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(WorkflowTemplate::class, 'workflow_template_id');
    }

    public function completer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function steps(): HasMany
    {
        return $this->hasMany(WorkflowStepCompletion::class)->orderBy('sort_order')->orderBy('id');
    }

    public function isComplete(): bool
    {
        return ! $this->steps()->where('is_required', true)->whereNull('completed_at')->exists();
    }

    public function refreshStatus(): self
    {
        $complete = $this->isComplete();
        $this->forceFill([
            'status' => $complete ? 'completed' : 'pending',
            'completed_at' => $complete ? ($this->completed_at ?? now()) : null,
            'completed_by' => $complete ? $this->completed_by : null,
        ])->save();

        return $this;
    }
}

