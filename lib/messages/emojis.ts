// lib/messages/emojis.ts
// Curated, categorized emoji set for the message composers' emoji picker.
// Each entry is [emoji, "space separated search keywords"]. Kept as a plain data
// module (no deps) so it can be imported anywhere and tree-shaken.

export interface EmojiCategory {
  key: string;
  label: string;
  icon: string;
  emojis: [string, string][];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: 'smileys', label: 'Smileys', icon: '😀',
    emojis: [
      ['😀', 'grin happy smile'], ['😃', 'happy smile joy'], ['😄', 'happy laugh'],
      ['😁', 'grin beaming'], ['😆', 'laugh haha'], ['😅', 'sweat laugh relief'],
      ['🤣', 'rofl rolling laugh'], ['😂', 'joy tears laugh'], ['🙂', 'slight smile'],
      ['🙃', 'upside down silly'], ['😉', 'wink'], ['😊', 'blush happy'],
      ['😇', 'angel innocent halo'], ['🥰', 'love hearts adore'], ['😍', 'love heart eyes'],
      ['🤩', 'star struck excited'], ['😘', 'kiss blow'], ['😗', 'kiss'],
      ['😋', 'yum tasty tongue'], ['😛', 'tongue playful'], ['😜', 'wink tongue'],
      ['🤪', 'zany crazy'], ['😝', 'tongue squint'], ['🤑', 'money mouth rich'],
      ['🤗', 'hug'], ['🤭', 'giggle oops'], ['🤔', 'thinking hmm'],
      ['🤐', 'zipper quiet'], ['😐', 'neutral meh'], ['😑', 'expressionless'],
      ['😶', 'no mouth speechless'], ['😏', 'smirk'], ['😒', 'unamused'],
      ['🙄', 'eye roll'], ['😬', 'grimace awkward'], ['😌', 'relieved calm'],
      ['😔', 'sad pensive'], ['😪', 'sleepy tired'], ['😴', 'sleep zzz'],
      ['😷', 'mask sick'], ['🤒', 'thermometer sick ill'], ['🤕', 'hurt injured'],
      ['🥵', 'hot sweating'], ['🥶', 'cold freezing'], ['😵', 'dizzy'],
      ['🤯', 'mind blown shocked'], ['😎', 'cool sunglasses'], ['🤓', 'nerd geek'],
      ['🧐', 'monocle inspect'], ['😕', 'confused'], ['😟', 'worried'],
      ['🙁', 'frown sad'], ['😮', 'wow surprised open'], ['😯', 'hushed'],
      ['😲', 'astonished shocked'], ['😳', 'flushed embarrassed'], ['🥺', 'pleading puppy'],
      ['😦', 'frowning'], ['😧', 'anguished'], ['😨', 'fearful'], ['😰', 'anxious sweat'],
      ['😥', 'sad relieved'], ['😢', 'cry tear sad'], ['😭', 'sob crying'],
      ['😱', 'scream fear'], ['😖', 'confounded'], ['😣', 'persevere'],
      ['😞', 'disappointed'], ['😓', 'downcast sweat'], ['😩', 'weary'],
      ['😫', 'tired'], ['🥱', 'yawn bored'], ['😤', 'triumph steam'],
      ['😡', 'angry mad rage'], ['😠', 'angry'], ['🤬', 'cursing swear'],
      ['😈', 'devil smiling'], ['👿', 'imp angry devil'], ['💀', 'skull dead'],
      ['💩', 'poop'], ['🤡', 'clown'], ['👻', 'ghost boo'], ['👽', 'alien'],
      ['🤖', 'robot'], ['🎃', 'pumpkin halloween'],
    ],
  },
  {
    key: 'gestures', label: 'People', icon: '👍',
    emojis: [
      ['👍', 'thumbs up like yes good'], ['👎', 'thumbs down dislike no'], ['👌', 'ok perfect'],
      ['🤌', 'pinched fingers'], ['✌️', 'peace victory'], ['🤞', 'fingers crossed luck'],
      ['🤟', 'love you'], ['🤘', 'rock horns'], ['🤙', 'call me hang loose'],
      ['👈', 'point left'], ['👉', 'point right'], ['👆', 'point up'], ['👇', 'point down'],
      ['☝️', 'index up'], ['✋', 'raised hand stop'], ['🤚', 'back hand'],
      ['🖐️', 'hand fingers'], ['🖖', 'vulcan spock'], ['👋', 'wave hi hello bye'],
      ['🤝', 'handshake deal'], ['👏', 'clap applause'], ['🙌', 'raised hands praise'],
      ['👐', 'open hands'], ['🤲', 'palms up'], ['🙏', 'pray thanks please'],
      ['✊', 'fist raised'], ['👊', 'fist bump punch'], ['🤛', 'left fist'], ['🤜', 'right fist'],
      ['💪', 'muscle strong flex'], ['🦾', 'mechanical arm'], ['✍️', 'writing hand'],
      ['💅', 'nails manicure'], ['👀', 'eyes look'], ['👁️', 'eye'], ['🧠', 'brain'],
      ['👶', 'baby'], ['🧑', 'person'], ['👨', 'man'], ['👩', 'woman'],
      ['🧓', 'older person'], ['👮', 'police officer'], ['👷', 'construction worker'],
      ['💼', 'briefcase work'], ['🕵️', 'detective'], ['🦸', 'superhero'],
    ],
  },
  {
    key: 'nature', label: 'Nature', icon: '🐶',
    emojis: [
      ['🐶', 'dog puppy'], ['🐱', 'cat'], ['🐭', 'mouse'], ['🐹', 'hamster'],
      ['🐰', 'rabbit bunny'], ['🦊', 'fox'], ['🐻', 'bear'], ['🐼', 'panda'],
      ['🐨', 'koala'], ['🐯', 'tiger'], ['🦁', 'lion'], ['🐮', 'cow'],
      ['🐷', 'pig'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🐔', 'chicken'],
      ['🐧', 'penguin'], ['🐦', 'bird'], ['🦆', 'duck'], ['🦉', 'owl'],
      ['🐴', 'horse'], ['🦄', 'unicorn'], ['🐝', 'bee'], ['🐛', 'bug caterpillar'],
      ['🦋', 'butterfly'], ['🐌', 'snail'], ['🐢', 'turtle'], ['🐍', 'snake'],
      ['🐙', 'octopus'], ['🐠', 'fish tropical'], ['🐬', 'dolphin'], ['🐳', 'whale'],
      ['🌵', 'cactus'], ['🌲', 'tree evergreen'], ['🌳', 'tree'], ['🌴', 'palm tree'],
      ['🌱', 'seedling plant'], ['🌿', 'herb leaf'], ['🍀', 'clover luck'], ['🍁', 'maple leaf'],
      ['🍂', 'fallen leaves autumn'], ['🌸', 'blossom flower'], ['🌺', 'hibiscus'],
      ['🌻', 'sunflower'], ['🌹', 'rose'], ['🌷', 'tulip'], ['🌼', 'daisy'],
      ['⭐', 'star'], ['🌟', 'glowing star'], ['✨', 'sparkles'], ['⚡', 'lightning bolt'],
      ['🔥', 'fire hot lit'], ['🌈', 'rainbow'], ['☀️', 'sun sunny'], ['⛅', 'cloud sun'],
      ['☁️', 'cloud'], ['🌧️', 'rain'], ['⛈️', 'storm'], ['❄️', 'snowflake cold'],
      ['💧', 'droplet water'], ['🌊', 'wave ocean water'],
    ],
  },
  {
    key: 'food', label: 'Food', icon: '🍔',
    emojis: [
      ['🍎', 'apple'], ['🍏', 'green apple'], ['🍊', 'orange'], ['🍋', 'lemon'],
      ['🍌', 'banana'], ['🍉', 'watermelon'], ['🍇', 'grapes'], ['🍓', 'strawberry'],
      ['🫐', 'blueberries'], ['🍒', 'cherries'], ['🍑', 'peach'], ['🥭', 'mango'],
      ['🍍', 'pineapple'], ['🥥', 'coconut'], ['🥝', 'kiwi'], ['🍅', 'tomato'],
      ['🥑', 'avocado'], ['🥦', 'broccoli'], ['🌽', 'corn'], ['🥕', 'carrot'],
      ['🥔', 'potato'], ['🍞', 'bread'], ['🥐', 'croissant'], ['🥨', 'pretzel'],
      ['🧀', 'cheese'], ['🥚', 'egg'], ['🍳', 'fried egg cooking'], ['🥞', 'pancakes'],
      ['🥓', 'bacon'], ['🍔', 'burger hamburger'], ['🍟', 'fries'], ['🍕', 'pizza'],
      ['🌭', 'hot dog'], ['🥪', 'sandwich'], ['🌮', 'taco'], ['🌯', 'burrito'],
      ['🥗', 'salad'], ['🍜', 'ramen noodles'], ['🍝', 'pasta spaghetti'], ['🍣', 'sushi'],
      ['🍱', 'bento'], ['🍚', 'rice'], ['🍦', 'ice cream'], ['🍩', 'donut'],
      ['🍪', 'cookie'], ['🎂', 'cake birthday'], ['🍰', 'cake slice'], ['🧁', 'cupcake'],
      ['🍫', 'chocolate'], ['🍬', 'candy'], ['🍭', 'lollipop'], ['🍯', 'honey'],
      ['🍿', 'popcorn'], ['☕', 'coffee tea hot'], ['🍵', 'tea green'], ['🧃', 'juice box'],
      ['🥤', 'soda drink cup'], ['🍺', 'beer'], ['🍻', 'cheers beers'], ['🍷', 'wine'],
      ['🥂', 'champagne toast'], ['🍸', 'cocktail'], ['🥃', 'whiskey'], ['🍾', 'bottle pop'],
    ],
  },
  {
    key: 'activity', label: 'Activity', icon: '⚽',
    emojis: [
      ['⚽', 'soccer football'], ['🏀', 'basketball'], ['🏈', 'football american'],
      ['⚾', 'baseball'], ['🎾', 'tennis'], ['🏐', 'volleyball'], ['🏉', 'rugby'],
      ['🎱', '8 ball pool'], ['🏓', 'ping pong'], ['🏸', 'badminton'], ['🥅', 'goal net'],
      ['🏒', 'hockey'], ['🏑', 'field hockey'], ['🥍', 'lacrosse'], ['🏏', 'cricket'],
      ['⛳', 'golf flag'], ['🏹', 'archery bow'], ['🎣', 'fishing'], ['🥊', 'boxing'],
      ['🥋', 'martial arts'], ['⛸️', 'ice skate'], ['🎿', 'ski'], ['🛷', 'sled'],
      ['🏂', 'snowboard'], ['🏋️', 'weight lift gym'], ['🤸', 'cartwheel'], ['🤺', 'fencing'],
      ['⛹️', 'basketball player'], ['🏊', 'swim'], ['🏄', 'surf'], ['🚴', 'bike cycling'],
      ['🏆', 'trophy win'], ['🥇', 'gold medal first'], ['🥈', 'silver medal'], ['🥉', 'bronze medal'],
      ['🏅', 'medal'], ['🎖️', 'military medal'], ['🎯', 'target dart bullseye'], ['🎲', 'dice game'],
      ['🎮', 'game controller'], ['🎰', 'slot machine'], ['🎨', 'art palette'], ['🎭', 'theater'],
      ['🎪', 'circus'], ['🎬', 'movie clapper film'], ['🎤', 'mic sing'], ['🎧', 'headphones'],
      ['🎵', 'music note'], ['🎶', 'music notes'], ['🎹', 'piano'], ['🎸', 'guitar'],
      ['🥁', 'drum'], ['🎺', 'trumpet'], ['🎻', 'violin'],
    ],
  },
  {
    key: 'travel', label: 'Travel', icon: '🚗',
    emojis: [
      ['🚗', 'car'], ['🚕', 'taxi'], ['🚙', 'suv'], ['🚌', 'bus'], ['🚎', 'trolley'],
      ['🏎️', 'race car'], ['🚓', 'police car'], ['🚑', 'ambulance'], ['🚒', 'fire truck'],
      ['🚐', 'van'], ['🚚', 'truck'], ['🚛', 'semi truck'], ['🚜', 'tractor'],
      ['🛴', 'scooter kick'], ['🚲', 'bicycle'], ['🛵', 'motor scooter'], ['🏍️', 'motorcycle'],
      ['🚨', 'siren alert'], ['🚔', 'police'], ['✈️', 'plane flight'], ['🛫', 'takeoff'],
      ['🛬', 'landing'], ['🚁', 'helicopter'], ['🚀', 'rocket launch'], ['🛸', 'ufo'],
      ['⛵', 'sailboat'], ['🚤', 'speedboat'], ['🛥️', 'motorboat'], ['🚢', 'ship'],
      ['⚓', 'anchor'], ['🚂', 'train steam'], ['🚆', 'train'], ['🚇', 'metro subway'],
      ['🚊', 'tram'], ['🚉', 'station'], ['🗺️', 'map'], ['🧭', 'compass'],
      ['🗿', 'moai statue'], ['🗽', 'statue liberty'], ['🗼', 'tower tokyo'], ['🏰', 'castle'],
      ['🏠', 'house home'], ['🏢', 'office building'], ['🏥', 'hospital'], ['🏦', 'bank'],
      ['🏨', 'hotel'], ['🏫', 'school'], ['⛲', 'fountain'], ['⛰️', 'mountain'],
      ['🏔️', 'snow mountain'], ['🌋', 'volcano'], ['🏕️', 'camping tent'], ['🏖️', 'beach'],
      ['🏝️', 'island'], ['🌅', 'sunrise'], ['🌄', 'sunrise mountains'], ['🌃', 'night city'],
      ['🌉', 'bridge night'], ['🌁', 'foggy'],
    ],
  },
  {
    key: 'objects', label: 'Objects', icon: '💡',
    emojis: [
      ['⌚', 'watch'], ['📱', 'phone mobile'], ['💻', 'laptop computer'], ['⌨️', 'keyboard'],
      ['🖥️', 'desktop monitor'], ['🖨️', 'printer'], ['🖱️', 'mouse'], ['💾', 'save disk floppy'],
      ['💿', 'cd disc'], ['📷', 'camera'], ['📹', 'video camera'], ['🎥', 'movie camera'],
      ['📞', 'phone call'], ['📟', 'pager'], ['📠', 'fax'], ['📺', 'tv television'],
      ['📻', 'radio'], ['🔋', 'battery'], ['🔌', 'plug power'], ['💡', 'idea bulb light'],
      ['🔦', 'flashlight'], ['🕯️', 'candle'], ['🧯', 'extinguisher'], ['🛢️', 'oil barrel'],
      ['💸', 'money flying'], ['💵', 'dollar cash'], ['💰', 'money bag'], ['💳', 'credit card'],
      ['🧾', 'receipt invoice'], ['💎', 'gem diamond'], ['⚖️', 'scale balance justice'],
      ['🔧', 'wrench tool'], ['🔨', 'hammer'], ['⚒️', 'hammer pick'], ['🛠️', 'tools'],
      ['⛏️', 'pick mining'], ['🔩', 'nut bolt'], ['⚙️', 'gear settings'], ['🧰', 'toolbox'],
      ['🧲', 'magnet'], ['📏', 'ruler straight'], ['📐', 'triangle ruler'], ['✂️', 'scissors cut'],
      ['📌', 'pin'], ['📍', 'location pin'], ['📎', 'paperclip attach'], ['🔗', 'link chain'],
      ['📝', 'memo note write'], ['✏️', 'pencil'], ['🖊️', 'pen'], ['🖌️', 'paintbrush'],
      ['📁', 'folder'], ['📂', 'open folder'], ['📅', 'calendar date'], ['📆', 'calendar tear'],
      ['📊', 'bar chart'], ['📈', 'chart up growth'], ['📉', 'chart down'], ['📋', 'clipboard'],
      ['📖', 'book open'], ['📚', 'books'], ['🔑', 'key'], ['🔒', 'lock'],
      ['🔓', 'unlock open'], ['🔔', 'bell notification'], ['📢', 'megaphone announce'],
      ['💬', 'speech chat message'], ['💭', 'thought bubble'], ['🗨️', 'speech'],
    ],
  },
  {
    key: 'symbols', label: 'Symbols', icon: '❤️',
    emojis: [
      ['❤️', 'red heart love'], ['🧡', 'orange heart'], ['💛', 'yellow heart'],
      ['💚', 'green heart'], ['💙', 'blue heart'], ['💜', 'purple heart'],
      ['🖤', 'black heart'], ['🤍', 'white heart'], ['🤎', 'brown heart'],
      ['💔', 'broken heart'], ['❣️', 'heart exclamation'], ['💕', 'two hearts'],
      ['💞', 'revolving hearts'], ['💓', 'beating heart'], ['💗', 'growing heart'],
      ['💖', 'sparkling heart'], ['💘', 'heart arrow cupid'], ['💝', 'heart gift'],
      ['💯', '100 hundred perfect'], ['✅', 'check yes done'], ['☑️', 'checkbox'],
      ['✔️', 'check mark'], ['❌', 'x cross no wrong'], ['❎', 'x button'],
      ['➕', 'plus add'], ['➖', 'minus'], ['➗', 'divide'], ['✖️', 'multiply'],
      ['❓', 'question'], ['❗', 'exclamation'], ['‼️', 'double exclamation'],
      ['⚠️', 'warning caution'], ['🚫', 'no forbidden'], ['🔴', 'red circle'],
      ['🟠', 'orange circle'], ['🟡', 'yellow circle'], ['🟢', 'green circle'],
      ['🔵', 'blue circle'], ['🟣', 'purple circle'], ['⚫', 'black circle'],
      ['⚪', 'white circle'], ['🔺', 'red triangle up'], ['🔻', 'red triangle down'],
      ['🔶', 'orange diamond'], ['🔷', 'blue diamond'], ['⭐', 'star'], ['🌟', 'glowing star'],
      ['💫', 'dizzy stars'], ['💥', 'boom collision'], ['💢', 'anger'], ['💦', 'sweat splash'],
      ['💨', 'dash wind'], ['🕐', 'clock time'], ['⏰', 'alarm clock'], ['⏳', 'hourglass wait'],
      ['♻️', 'recycle'], ['🔄', 'refresh loop'], ['➡️', 'arrow right'], ['⬅️', 'arrow left'],
      ['⬆️', 'arrow up'], ['⬇️', 'arrow down'], ['🔝', 'top'], ['🆗', 'ok'],
      ['🆕', 'new'], ['🆙', 'up'], ['🔥', 'fire lit'], ['⭕', 'circle o'],
    ],
  },
];

/** Flat search over all emojis by keyword/name. Returns matching emoji chars. */
export function searchEmojis(query: string, limit = 60): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: string[] = [];
  for (const cat of EMOJI_CATEGORIES) {
    for (const [emoji, keywords] of cat.emojis) {
      if (keywords.includes(q) || keywords.split(' ').some((w) => w.startsWith(q))) {
        out.push(emoji);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
