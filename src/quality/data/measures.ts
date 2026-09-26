import { MeasureDefinition } from '../quality';

/**
 * The measures this system can calculate from its own record.
 *
 * Every one is marked `built-in`, which means the wording below is this
 * system's, not the Ministry's. Several resemble indicators on MOH 711 and the
 * KHIS indicator dictionary, but resembling is not matching: a facility that
 * reported one of these as a national indicator could be reporting a different
 * population under the same name. When the official definitions are to hand
 * they can be imported and matched, and `nationalIndicator` filled in.
 *
 * They are drawn from maternal and child health because that is where this
 * record is richest and where the populations are unambiguous — a pregnancy
 * booked, a contact attended, a baby weighed. A measure whose denominator
 * cannot be stated exactly is not worth calculating.
 */
export const BUILT_IN_MEASURES: readonly MeasureDefinition[] = [
  {
    id: 'anc-first-contact-first-trimester',
    title: 'First antenatal contact in the first trimester',
    description: 'Women whose first antenatal contact happened before 13 completed weeks.',
    numerator: 'Pregnancies whose contact 1 was attended at a gestation under 13 weeks',
    denominator: 'Pregnancies whose contact 1 was attended in the period',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Antenatal care',
    provenance: 'built-in',
    nationalIndicator: null,
  },
  {
    id: 'anc-four-plus-contacts',
    title: 'Four or more antenatal contacts',
    description: 'Pregnancies ending in the period that reached at least four contacts.',
    numerator: 'Pregnancies with four or more antenatal contacts recorded',
    denominator: 'Pregnancies that ended in the period',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Antenatal care',
    provenance: 'built-in',
  },
  {
    id: 'anc-eight-contacts',
    title: 'Eight antenatal contacts',
    description: "Pregnancies that completed the national schedule's eight contacts.",
    numerator: 'Pregnancies with eight or more antenatal contacts recorded',
    denominator: 'Pregnancies that ended in the period',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Antenatal care',
    provenance: 'built-in',
  },
  {
    id: 'anc-ifas',
    title: 'Iron and folic acid given in pregnancy',
    description: 'Pregnancies with iron and folic acid recorded at any antenatal contact.',
    numerator: 'Pregnancies with iron and folic acid recorded at least once',
    denominator: 'Pregnancies with at least one antenatal contact in the period',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Antenatal care',
    provenance: 'built-in',
  },
  {
    id: 'anc-profile-complete',
    title: 'Antenatal profile completed',
    description: 'Pregnancies with every test of the antenatal profile recorded.',
    numerator: 'Pregnancies with a result for all eight profile tests',
    denominator: 'Pregnancies with at least one antenatal contact in the period',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Antenatal care',
    provenance: 'built-in',
  },
  {
    id: 'delivery-amtsl',
    title: 'Active management of the third stage',
    description: 'Deliveries where the third stage was actively managed.',
    numerator: 'Deliveries with active management of the third stage recorded',
    denominator: 'Deliveries in the period',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Delivery',
    provenance: 'built-in',
  },
  {
    id: 'delivery-skilled-attendant',
    title: 'Deliveries with a named attendant',
    description: 'Deliveries recording who conducted them.',
    numerator: 'Deliveries with an attendant named',
    denominator: 'Deliveries in the period',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Delivery',
    provenance: 'built-in',
  },
  {
    id: 'low-birth-weight',
    title: 'Low birth weight',
    description: 'Live births weighing under 2500 g.',
    numerator: 'Live births with a recorded weight under 2500 g',
    denominator: 'Live births with a recorded weight',
    improvement: 'decrease',
    scoring: 'proportion',
    category: 'Newborn',
    provenance: 'built-in',
  },
  {
    id: 'stillbirth-rate',
    title: 'Stillbirths',
    description: 'Stillbirths as a proportion of all births.',
    numerator: 'Births recorded as fresh or macerated stillbirths',
    denominator: 'All births in the period',
    improvement: 'decrease',
    scoring: 'proportion',
    category: 'Newborn',
    provenance: 'built-in',
  },
  {
    id: 'breastfeeding-within-hour',
    title: 'Breastfeeding within the first hour',
    description: 'Live births put to the breast within an hour.',
    numerator: 'Live births with breastfeeding within the hour recorded',
    denominator: 'Live births in the period',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Newborn',
    provenance: 'built-in',
  },
  {
    id: 'pnc-within-48h',
    title: 'Postnatal contact within 48 hours',
    description: 'Mothers seen within 48 hours of birth.',
    numerator: 'Births followed by a postnatal contact in the within-48-hours window',
    denominator: 'Births in the period after which postnatal care applies',
    improvement: 'increase',
    scoring: 'proportion',
    category: 'Postnatal care',
    provenance: 'built-in',
  },
  {
    id: 'maternal-deaths',
    title: 'Maternal deaths',
    description: 'Deliveries in which the mother died. A count, not a rate.',
    numerator: 'Deliveries whose maternal outcome was recorded as died',
    denominator: 'Not applicable — reported as a count',
    improvement: 'decrease',
    scoring: 'count',
    category: 'Delivery',
    provenance: 'built-in',
  },
];

export const MEASURE_BY_ID = new Map(BUILT_IN_MEASURES.map((m) => [m.id, m]));
