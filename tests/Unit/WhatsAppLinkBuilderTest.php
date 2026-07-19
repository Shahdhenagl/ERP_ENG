<?php

use App\Services\WhatsAppLinkBuilder;

beforeEach(function () {
    $this->builder = new WhatsAppLinkBuilder;
});

it('normalises local numbers to international form', function (string $input, string $expected) {
    expect($this->builder->normalizeNumber($input))->toBe($expected);
})->with([
    ['01012345678', '201012345678'],      // local
    ['201012345678', '201012345678'],     // already international
    ['+20 101 234 5678', '201012345678'], // spaced with plus
    ['0020 1012345678', '201012345678'],  // 00 prefix
    ['010-1234-5678', '201012345678'],    // hyphenated
]);

it('returns null for a missing or unusable number', function (?string $input) {
    expect($this->builder->normalizeNumber($input))->toBeNull();
})->with([null, '', '   ', 'abc']);

it('builds a wa.me link with the message url-encoded', function () {
    $link = $this->builder->link('01012345678', 'مرحبا بك');

    expect($link)->toStartWith('https://wa.me/201012345678?text=')
        ->and(rawurldecode(explode('text=', $link)[1]))->toBe('مرحبا بك');
});

it('returns no link when there is no number to send to', function () {
    expect($this->builder->link(null, 'أي رسالة'))->toBeNull();
});
