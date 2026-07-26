<?php

use App\Models\Branch;
use App\Models\Customer;
use Database\Seeders\RouteImportSeeder;

/**
 * The route sheet imports cleanly: the right customers and sites, each site's
 * خط السير summing to what the sheet totalled, and running it twice changes
 * nothing.
 */
it('imports the customers, sites and routes from the sheet', function () {
    (new RouteImportSeeder)->run();

    expect(Customer::whereIn('name', ['سيمكس', 'البنك الأهلي', 'البنك العقاري'])->count())->toBe(3)
        ->and(Branch::count())->toBe(25);

    // سيمكس أكتوبر — ten legs summing to 262 on the sheet.
    $simkes = Branch::whereHas('customer', fn ($q) => $q->where('name', 'سيمكس'))->first();
    expect($simkes->routeTotal())->toBe(262.0)
        ->and($simkes->route['legs'])->toHaveCount(10);

    // An Upper-Egypt site carries its lodging into the float.
    $aswan = Branch::where('name', 'like', 'اسوان الكورنيش%')->first();
    expect($aswan->routeTotal())->toBe(2133.0);
});

it('refreshes rather than duplicates when run again', function () {
    (new RouteImportSeeder)->run();
    (new RouteImportSeeder)->run();

    expect(Customer::count())->toBe(3)
        ->and(Branch::count())->toBe(25);
});
