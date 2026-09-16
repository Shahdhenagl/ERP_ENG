<?php

namespace App\Enums;

use App\Support\Terms;

enum QuotationFollowUpStatus: string
{
    case NoAnswer = 'no_answer';
    case CallBack = 'call_back';
    case Interested = 'interested';
    case NotInterested = 'not_interested';
    case WrongNumber = 'wrong_number';
    case AlreadyHasService = 'already_has_service';
    case FollowUp = 'follow_up';
    case AppointmentSet = 'appointment_set';
    case RescheduledAppointment = 'rescheduled_appointment';
    case CancelledAppointment = 'cancelled_appointment';
    case DisconnectedNumber = 'disconnected_number';
    case DecisionMakerUnavailable = 'decision_maker_unavailable';

    public function label(): string
    {
        return Terms::get(match ($this) {
            self::NoAnswer => 'No Answer',
            self::CallBack => 'Call Back',
            self::Interested => 'Interested',
            self::NotInterested => 'Not Interested',
            self::WrongNumber => 'Wrong Number',
            self::AlreadyHasService => 'Already Has Service',
            self::FollowUp => 'Follow Up',
            self::AppointmentSet => 'Appointment Set — appointment',
            self::RescheduledAppointment => 'Rescheduled appointment',
            self::CancelledAppointment => 'Canceled — appointment',
            self::DisconnectedNumber => 'Disconnected Number — gatekeeper',
            self::DecisionMakerUnavailable => 'Decision Maker Unavailable —',
        });
    }
}
