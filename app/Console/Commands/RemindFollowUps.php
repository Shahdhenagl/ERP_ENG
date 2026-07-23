<?php

namespace App\Console\Commands;

use App\Models\FollowUp;
use App\Notifications\FollowUpDue;
use Illuminate\Console\Command;

/**
 * The nightly nudge for follow-ups that have come due.
 *
 * It reminds the person who owns the follow-up — or, failing an owner, whoever
 * booked it — once, on the day it falls due. `reminded_at` is stamped on every
 * one it touches, owner or not, so the same follow-up is never processed twice
 * and the query stays small as the table grows.
 */
class RemindFollowUps extends Command
{
    protected $signature = 'follow-ups:remind';

    protected $description = 'تنبيه أصحاب المتابعات المستحقة اليوم';

    public function handle(): int
    {
        $due = FollowUp::query()
            ->needsReminder()
            ->with(['owner', 'creator', 'subject'])
            ->get();

        $notified = 0;

        foreach ($due as $followUp) {
            // The owner carries it; the creator is the fallback when nobody was
            // put on it, because they at least know why it exists.
            $recipient = $followUp->owner ?? $followUp->creator;

            if ($recipient && $recipient->is_active) {
                $recipient->notify(new FollowUpDue($followUp));
                $notified++;
            }

            // Stamped whether or not anyone was reachable, so an orphan
            // follow-up is not re-examined every night forever.
            $followUp->forceFill(['reminded_at' => now()])->save();
        }

        $this->info($due->isEmpty()
            ? 'لا توجد متابعات مستحقة.'
            : "تمّت معالجة {$due->count()} متابعة، وأُرسل {$notified} تنبيهًا.");

        return self::SUCCESS;
    }
}
