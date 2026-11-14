import { CATEGORIES } from '../product.mjs';
// Editorial angles, not measured trends, user activity or fabricated analytics.
const ANGLES = {
  'home-decor': ['small-room storage', 'renter-friendly lighting', 'a calming bedroom', 'entryway organization', 'layering natural textures', 'a compact home workspace', 'styling open shelves', 'a budget-conscious room refresh'],
  'food-recipes': ['a simple weeknight dinner', 'make-ahead lunch ideas', 'a balanced breakfast routine', 'seasonal vegetable inspiration', 'a one-pot family meal', 'kitchen organization before cooking', 'a beginner-friendly baking project', 'reducing everyday food waste'],
  'fashion-style': ['building a practical capsule wardrobe', 'comfortable everyday outfits', 'layering for changing weather', 'choosing versatile accessories', 'organizing a small wardrobe', 'caring for favorite clothes', 'a relaxed weekend outfit', 'repeating outfits creatively'],
  'beauty-skincare': ['a gentle beginner skincare routine', 'organizing beauty essentials', 'understanding patch testing', 'simple makeup organization', 'careful sun-protection habits', 'a low-fuss evening routine', 'choosing products thoughtfully', 'avoiding unsupported beauty promises'],
  'diy-crafts': ['a beginner paper craft', 'upcycling an everyday container', 'a handmade gift idea', 'organizing craft supplies', 'a small decorative project', 'a simple no-sew craft', 'a creative weekend activity', 'planning a safe craft workspace'],
  'wedding-events': ['a thoughtful guest welcome', 'a simple table setting', 'a practical planning checklist', 'handmade celebration details', 'organizing an intimate event', 'choosing a cohesive color palette', 'a celebration on a careful budget', 'an event-day essentials checklist'],
  'travel-tourism': ['packing light for a short trip', 'planning a flexible itinerary', 'organizing travel documents', 'thoughtful local travel', 'comfortable travel-day essentials', 'a first-time trip planning checklist', 'responsible destination research', 'documenting a trip creatively'],
  'gardening-outdoor': ['starting a small balcony garden', 'organizing a container garden', 'understanding basic plant care', 'a comfortable outdoor corner', 'choosing a suitable growing space', 'a beginner gardening checklist', 'keeping garden tools organized', 'observing seasonal plant needs'],
  'health-wellness': ['a gentle everyday movement routine', 'making time for rest', 'organizing a realistic wellbeing routine', 'beginner-friendly stretching habits', 'building a consistent sleep routine', 'taking useful screen breaks', 'setting achievable activity goals', 'knowing when to seek professional advice'],
  'parenting-kids': ['a supervised family craft activity', 'organizing a family reading corner', 'a calm after-school routine', 'screen-free family time', 'a simple supervised indoor activity', 'organizing family essentials', 'planning an age-appropriate creative activity', 'building a predictable family routine'],
};
export function categoryTopic(account) {
  const ids = account.category_ids || [], sequence = Math.max(0, account.topic_index - 1), id = ids[sequence % ids.length], category = CATEGORIES.find(item => item.id === id);
  if (!category || !ANGLES[id]) throw new Error('A valid selected content category is required.');
  const angle = ANGLES[id][Math.floor(sequence / ids.length) % ANGLES[id].length];
  return { topic: `${category.label}: ${angle}`.slice(0, 160), metadata: { source: 'category_rotation', label: 'Your selected category', categoryId: id, categoryLabel: category.label, angle } };
}
