<?php
$t = App\Models\Task::latest('id')->first();
echo "task {$t->id} created_by={$t->created_by} status={$t->status->value}\n";
echo 'notification rows: '.DB::table('notifications')->count()."\n";
foreach (DB::table('notifications')->orderByDesc('created_at')->limit(5)->get() as $n) {
    echo "  notifiable={$n->notifiable_id} type=".class_basename($n->type).' data='.substr($n->data, 0, 60)."\n";
}
