// One public product vocabulary. No sample account activity or AI vendor metadata.
export const PRODUCT_NAV = [
  { label: 'Home', href: '/' },
  { label: 'Pin Generator', href: '/pin-generator' },
  { label: 'Article Writer', href: '/article-writer' },
  { label: 'Content Studio', href: '/content-studio' },
  { label: 'Connector', href: '/connector' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'My Library', href: '/library' },
];
export const MAX_PINS_PER_DAY = 6;
export const CATEGORIES = [
  { id: 'home-decor', label: 'Home Decor & Interior Design', description: 'Thoughtful spaces, practical room ideas and interiors.' },
  { id: 'food-recipes', label: 'Food & Recipes', description: 'Recipes, meal ideas and useful kitchen guides.' },
  { id: 'fashion-style', label: 'Fashion & Style', description: 'Outfit inspiration, personal style and wardrobe ideas.' },
  { id: 'beauty-skincare', label: 'Beauty & Skincare', description: 'General beauty education and careful skincare guides.' },
  { id: 'diy-crafts', label: 'DIY & Crafts', description: 'Hands-on projects, creative hobbies and craft guides.' },
  { id: 'wedding-events', label: 'Wedding & Events', description: 'Celebrations, thoughtful details and event planning.' },
  { id: 'travel-tourism', label: 'Travel & Tourism', description: 'Travel inspiration and evergreen destination planning.' },
  { id: 'gardening-outdoor', label: 'Gardening & Outdoor Living', description: 'Plant care, small gardens and outdoor spaces.' },
  { id: 'health-wellness', label: 'Health, Fitness & Wellness', description: 'General wellbeing and beginner-friendly movement, not medical advice.' },
  { id: 'parenting-kids', label: 'Parenting & Kids', description: 'Family activities and general parenting inspiration.' },
];
export const CATEGORY_IDS = CATEGORIES.map(category => category.id);
export const categoryLabel = id => CATEGORIES.find(category => category.id === id)?.label || '';
export const PAYMENT_NUMBER = '01964182265';
export const WORKSPACE_NAV = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Publish article', href: '/publish' },
  { label: 'Publishing setup', href: '/automation' },
  { label: 'Connections', href: '/connector' },
  { label: 'Publishing jobs', href: '/jobs' },
  { label: 'Subscription', href: '/subscription' },
];
