<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkflowTemplateStep extends Model
{
    use HasFactory;

    protected $fillable = ['workflow_template_id', 'name', 'description', 'sort_order', 'is_required'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer', 'is_required' => 'boolean'];
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(WorkflowTemplate::class, 'workflow_template_id');
    }
}

