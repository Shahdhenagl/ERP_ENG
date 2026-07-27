/**
 * A default maintenance-contract body, merged from the contract's own data.
 *
 * It follows the UPS service-agreement wording the company uses, filling the
 * parties, the device, the value, the visits and the dates from the record. It
 * is only a starting point — it is written into an editable field, so a
 * particular customer's contract can be adjusted before it is printed.
 */
export interface ContractTermsInput {
    customerName: string
    customerAddress?: string | null
    company: Record<string, string>
    assets: Array<{ brand?: string | null; model?: string | null; capacity?: string | null }>
    startsOn: string
    endsOn: string
    visitsPerYear: number
    value?: number | null
    billingLabel: string
    slaResponseHours?: number | null
}

/** DD / MM / YYYY, or a blank slot when the date is missing. */
function ar(date?: string | null): string {
    if (!date) return '.... / .... / ........'
    const [y, m, d] = date.split('-')
    return `${d} / ${m} / ${y}`
}

function money(value?: number | null): string {
    return value ? `${value.toLocaleString('en-EG')} جنيهًا مصريًا` : '................'
}

export function defaultContractTerms(input: ContractTermsInput): string {
    const companyName = input.company.company_name || 'الشركة'
    const companyAddress = input.company.company_address || ''
    const companyPhone = input.company.company_phone || ''

    const devices =
        input.assets.length > 0
            ? input.assets
                  .map((a) => [a.brand, a.model, a.capacity].filter(Boolean).join(' '))
                  .filter(Boolean)
                  .join(' ، ') || 'الوحدة المذكورة'
            : 'جميع وحدات مانع انقطاع التيار (UPS) المملوكة للطرف الأول'

    const visits = input.visitsPerYear
    const everyMonths = visits > 0 ? Math.round(12 / visits) : 0
    const response = input.slaResponseHours || 48

    return `عقد صيانة أجهزة مانع انقطاع التيار الكهربائي (UPS)

إنه في يوم ........ الموافق ${ar(input.startsOn)} تم الاتفاق والتراضي بين كل من:

أولًا: ${input.customerName}
العنوان: ${input.customerAddress || '................'}
ويُشار إليه فيما بعد بـ (الطرف الأول).

ثانيًا: ${companyName}
العنوان: ${companyAddress}
${companyPhone ? `تليفون: ${companyPhone}` : ''}
ويُشار إليها فيما بعد بـ (الطرف الثاني).

تمهيد
لما كان الطرف الأول يمتلك ${devices}، ولما كان الطرف الثاني يمتلك مركز خدمة لصيانة وإصلاح تلك الوحدات، وكان الطرفان يرغبان في التعاقد على صيانة الوحدة المذكورة؛ فقد تلاقت إرادة الطرفين — بعد أن أقرّا بأهليتهما للتعاقد — واتفقا على ما يلي:

البند الأول:
يُعتبر التمهيد السابق جزءًا لا يتجزأ من هذا العقد.

البند الثاني:
يوافق الطرف الثاني على القيام بالآتي:
- إيفاد أحد المختصين لديه لعمل الصيانة الدورية والوقائية للوحدة محل هذا العقد بموقع الطرف الأول.
- يشمل العقد عدد (${visits}) زيارة سنويًا${everyMonths ? ` بواقع زيارة كل ${everyMonths} أشهر` : ''}.
- القيام بعملية الإصلاح في حالة حدوث الأعطال، ويشمل استبدال قطع الغيار التالفة، ولا يشمل البطاريات الخاصة بالوحدة.
- الاستجابة لطلبات الإصلاح والأعطال في فترة أقصاها ${response} ساعة من تاريخ التبليغ عن العطل، وذلك في مواعيد العمل المذكورة بالبند الرابع.

البند الثالث:
اتفق الطرفان على أن تكون أتعاب الطرف الثاني نظير قيامه بصيانة الوحدة مبلغ ${money(input.value)}، وذلك لمدة عام تُدفع قيمة الصيانة السنوية بنظام «${input.billingLabel}» بشيكات لصالح الطرف الثاني، ويشمل العقد قطع الغيار ولا يشمل البطاريات، على أن تُزاد قيمة العقد بنسبة 10% سنويًا غير شامل ضريبة القيمة المضافة.

البند الرابع:
اتفق الطرفان على أن تكون ساعات الصيانة والإصلاح من الساعة التاسعة صباحًا حتى الساعة الرابعة مساءً، من السبت حتى الخميس من كل أسبوع، عدا العطلات الرسمية.

البند الخامس:
يتعين على الطرف الأول الحصول على موافقة كتابية من الطرف الثاني في حالة رغبته في نقل أي وحدة من مكانها إلى مكان آخر، قبل مدة لا تقل عن 48 ساعة من تاريخ النقل.

البند السادس:
لا يشمل هذا العقد الأعطال الناتجة عن سوء الاستخدام، أو الإصلاح بمعرفة أشخاص غير مفوّضين من الطرف الثاني، أو استخدام قطع غيار دون موافقته، أو الحوادث الخارجة عن إرادته (حرائق، فيضانات، توصيلات كهربائية غير سليمة، إهمال في التشغيل أو النقل)، أو أي تعديلات ميكانيكية أو كهربائية دون موافقته، أو الدهان الخارجي للوحدة.

البند السابع:
يقر الطرف الأول بأنه المالك الحقيقي للوحدة محل هذا العقد، وأنه — في حال عدم توافر هذا الشرط — موكَّل من المالك الحقيقي للدخول في هذا التعاقد.

البند الثامن:
لا يحق لأي من الطرفين نقل حقه في هذا العقد لطرف ثالث إلا بعد موافقة كتابية من الطرف الآخر.

البند التاسع:
مدة هذا العقد عام واحد اعتبارًا من ${ar(input.startsOn)} حتى ${ar(input.endsOn)}، ويتجدد لمدد مماثلة ما لم يُلغِه أحد الطرفين قبل شهر من انتهاء المدة السارية بخطاب مسجل بعلم الوصول.

البند العاشر:
مسؤولية الطرف الثاني عن صيانة الوحدة هي المسؤولية المباشرة فقط، ولا يُسأل عن أي أضرار مادية أو معنوية تقع على الطرف الأول أو على الوحدة أو أي ممتلكات أخرى.

البند الحادي عشر:
حُرِّر هذا العقد من نسختين بيد كل طرف نسخة للعمل بها.


الطرف الأول (العميل)                                        الطرف الثاني (${companyName})

..............................                                    ..............................`
}
