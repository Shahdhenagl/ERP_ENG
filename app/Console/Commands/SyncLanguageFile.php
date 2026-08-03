<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Rebuilds lang/en/terms.php from the interface dictionary.
 *
 * The screens and the API say the same words to the same person, so they
 * translate from one list. Keeping a second list beside it by hand is how a
 * status comes to read one way in a table and another in the record behind it,
 * so the PHP side is generated and never edited.
 */
class SyncLanguageFile extends Command
{
    protected $signature = 'lang:sync';

    protected $description = 'Regenerate lang/en/terms.php from resources/js/locales/en.ts';

    public function handle(): int
    {
        $source = base_path('resources/js/locales/en.ts');

        if (! is_file($source)) {
            $this->error('لم يُعثر على resources/js/locales/en.ts');

            return self::FAILURE;
        }

        $lines = [];

        // Read line by line rather than with one regex over the whole file.
        // The entries are one per line by construction, and a pattern that has
        // to survive both PHP's string escaping and PCRE's is a pattern nobody
        // will be able to correct later.
        foreach (file($source, FILE_IGNORE_NEW_LINES) as $line) {
            if (! str_starts_with($line, '    ') || ! str_ends_with($line, "',")) {
                continue;
            }

            $entry = $this->parse(trim($line));

            if ($entry === null) {
                continue;
            }

            [$arabic, $english] = $entry;

            $lines[] = '    '.var_export($arabic, true).' => '.var_export($english, true).',';
        }

        if ($lines === []) {
            $this->error('تعذّرت قراءة أي مدخل من ملف الترجمة.');

            return self::FAILURE;
        }

        $header = "<?php\n\n"
            ."/**\n"
            ." * English, keyed by the Arabic the system is written in.\n"
            ." *\n"
            ." * GENERATED from resources/js/locales/en.ts — do not edit by hand.\n"
            ." * Regenerate with: php artisan lang:sync\n"
            ." */\n\n"
            ."return [\n";

        file_put_contents(lang_path('en/terms.php'), $header.implode("\n", $lines)."\n];\n");

        $this->info('تمت مزامنة '.count($lines).' مدخلًا إلى lang/en/terms.php.');

        return self::SUCCESS;
    }

    /**
     * One `key: 'value',` line into its two halves.
     *
     * The key is quoted only when it has to be — an Arabic word that is a
     * valid identifier is written bare — so both forms are read.
     *
     * @return array{0: string, 1: string}|null
     */
    protected function parse(string $line): ?array
    {
        if (str_starts_with($line, "'")) {
            $end = $this->closingQuote($line, 1);

            if ($end === null) {
                return null;
            }

            $key = substr($line, 1, $end - 1);
            $rest = substr($line, $end + 1);
        } else {
            $colon = strpos($line, ':');

            if ($colon === false) {
                return null;
            }

            $key = rtrim(substr($line, 0, $colon));
            $rest = substr($line, $colon);
        }

        if (! str_starts_with($rest, ": '")) {
            return null;
        }

        return [stripcslashes($key), stripcslashes(substr($rest, 3, -2))];
    }

    /** The index of the quote that closes the one at `$from - 1`. */
    protected function closingQuote(string $line, int $from): ?int
    {
        for ($i = $from, $length = strlen($line); $i < $length; $i++) {
            if ($line[$i] === '\\') {
                $i++;

                continue;
            }

            if ($line[$i] === "'") {
                return $i;
            }
        }

        return null;
    }
}
