/**
 * Crypto module for 0xio Wallet Extension
 * Handles Ed25519 cryptographic operations using TweetNaCl
 * Uses BIP39 standard for mnemonic generation and seed derivation
 */

class CryptoManager {
    constructor(privateKey = null) {
        this.privateKey = privateKey;
        this.publicKey = null;
        this.signingKey = null;
    }

    /**
     * Set private key from base64 string
     * @param {string} privateKeyBase64
     */
    setPrivateKey(privateKeyBase64) {
        try {
            if (!privateKeyBase64 || typeof privateKeyBase64 !== 'string') {
                throw new Error('Private key must be a non-empty string');
            }
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(privateKeyBase64)) {
                throw new Error('Private key is not a valid base64 string');
            }
            const privateKeyBytes = this.base64ToBytes(privateKeyBase64);
            if (privateKeyBytes.length !== 32) {
                throw new Error(`Invalid private key length: ${privateKeyBytes.length} bytes, expected 32 bytes`);
            }
            this.signingKey = nacl.sign.keyPair.fromSeed(privateKeyBytes);
            this.privateKey = privateKeyBase64;
            this.publicKey = this.bytesToBase64(this.signingKey.publicKey);
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Generate new key pair with mnemonic (following official wallet-gen spec exactly)
     * @returns {Object}
     */
    async generateKeyPair() {
        try {
            const entropy = crypto.getRandomValues(new Uint8Array(16));
            const entropyHex = this.bytesToHex(entropy);
            const mnemonic = await this.entropyToMnemonic(entropyHex);
            const mnemonicWords = mnemonic.split(' ');
            const seed = await this.mnemonicToSeed(mnemonic);
            const seedHex = this.bytesToHex(seed);
            const masterKey = await this.deriveMasterKey(seed);
            const masterChainHex = this.bytesToHex(masterKey.chainCode);
            this.signingKey = nacl.sign.keyPair.fromSeed(masterKey.privateKey);
            const privateKeyRaw = masterKey.privateKey;
            const publicKeyRaw = this.signingKey.publicKey;
            const privateKeyHex = this.bytesToHex(privateKeyRaw);
            const publicKeyHex = this.bytesToHex(publicKeyRaw);
            const privateKeyB64 = this.bytesToBase64(privateKeyRaw);
            const publicKeyB64 = this.bytesToBase64(publicKeyRaw);
            const address = await this.deriveAddress(publicKeyB64);
            const testMessage = '{"from":"test","to":"test","amount":"1000000","nonce":1}';
            const messageBytes = this.stringToBytes(testMessage);
            const signature = nacl.sign.detached(messageBytes, this.signingKey.secretKey);
            const signatureB64 = this.bytesToBase64(signature);
            const signatureValid = nacl.sign.detached.verify(
                messageBytes,
                signature,
                this.signingKey.publicKey
            );
            this.privateKey = privateKeyB64;
            this.publicKey = publicKeyB64;

            return {
                mnemonic: mnemonicWords,
                seed_hex: seedHex,
                master_chain_hex: masterChainHex,
                private_key_hex: privateKeyHex,
                public_key_hex: publicKeyHex,
                private_key_b64: privateKeyB64,
                public_key_b64: publicKeyB64,
                address: address,
                entropy_hex: entropyHex,
                test_message: testMessage,
                test_signature: signatureB64,
                signature_valid: signatureValid
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Convert entropy to BIP39 mnemonic (official BIP39 implementation)
     * @param {string} entropyHex
     * @returns {Promise<string>}
     */
    async entropyToMnemonic(entropyHex) {
        const wordlist = [
            "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse",
            "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act",
            "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust", "admit",
            "adult", "advance", "advice", "aerobic", "affair", "afford", "afraid", "again", "against", "age",
            "agent", "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol",
            "alert", "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also",
            "alter", "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient",
            "anger", "angle", "angry", "animal", "ankle", "announce", "annual", "another", "answer", "antenna",
            "antique", "anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april", "area",
            "arena", "argue", "arm", "armed", "armor", "army", "around", "arrange", "arrest", "arrive",
            "arrow", "art", "article", "artist", "artwork", "ask", "aspect", "assault", "asset", "assist",
            "assume", "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction", "audit",
            "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid", "awake", "aware",
            "away", "awesome", "awful", "awkward", "axis", "baby", "bachelor", "bacon", "badge", "bag",
            "balance", "balcony", "ball", "bamboo", "banana", "banner", "bar", "barely", "bargain", "barrel",
            "base", "basic", "basket", "battle", "beach", "bean", "beauty", "because", "become", "beef",
            "before", "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit", "best",
            "betray", "better", "between", "beyond", "bicycle", "bid", "bike", "bind", "biology", "bird",
            "birth", "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless", "blind",
            "blood", "blossom", "blow", "blue", "blur", "blush", "board", "boat", "body", "boil",
            "bomb", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss", "bottom",
            "bounce", "box", "boy", "bracket", "brain", "brand", "brass", "brave", "bread", "breeze",
            "brick", "bridge", "brief", "bright", "bring", "brisk", "broccoli", "broken", "bronze", "broom",
            "brother", "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb", "bulk",
            "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus", "business", "busy", "butter",
            "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage", "cake", "call", "calm",
            "camera", "camp", "can", "canal", "cancel", "candy", "cannon", "canoe", "canvas", "canyon",
            "capable", "capital", "captain", "car", "carbon", "card", "care", "career", "careful", "careless",
            "cargo", "carpet", "carry", "cart", "case", "cash", "casino", "cast", "casual", "cat",
            "catalog", "catch", "category", "cattle", "caught", "cause", "caution", "cave", "ceiling", "celery",
            "cement", "census", "century", "cereal", "certain", "chair", "chalk", "champion", "change", "chaos",
            "chapter", "charge", "chase", "chat", "cheap", "check", "cheese", "chef", "cherry", "chest",
            "chicken", "chief", "child", "chimney", "choice", "choose", "chronic", "chuckle", "chunk", "churn",
            "cigar", "cinnamon", "circle", "citizen", "city", "civil", "claim", "clamp", "clarify", "clash",
            "class", "clause", "clean", "clerk", "clever", "click", "client", "cliff", "climb", "clinic",
            "clip", "clock", "clog", "close", "cloth", "cloud", "clown", "club", "clump", "cluster",
            "clutch", "coach", "coast", "coconut", "code", "coffee", "coil", "coin", "collect", "color",
            "column", "combine", "come", "comfort", "comic", "common", "company", "concert", "conduct", "confirm",
            "congress", "connect", "consider", "control", "convince", "cook", "cool", "copper", "copy", "coral",
            "core", "corn", "correct", "cost", "cotton", "couch", "country", "couple", "course", "cousin",
            "cover", "coyote", "crack", "cradle", "craft", "cram", "crane", "crash", "crater", "crawl",
            "crazy", "cream", "credit", "creek", "crew", "cricket", "crime", "crisp", "critic", "crop",
            "cross", "crouch", "crowd", "crucial", "cruel", "cruise", "crumble", "crunch", "crush", "cry",
            "crystal", "cube", "culture", "cup", "cupboard", "curious", "current", "curtain", "curve", "cushion",
            "custom", "cute", "cycle", "dad", "damage", "damp", "dance", "danger", "daring", "dash",
            "daughter", "dawn", "day", "deal", "debate", "debris", "decade", "december", "decide", "decline",
            "decorate", "decrease", "deer", "defense", "define", "defy", "degree", "delay", "deliver", "demand",
            "demise", "denial", "dentist", "deny", "depart", "depend", "deposit", "depth", "deputy", "derive",
            "describe", "desert", "design", "desk", "despair", "destroy", "detail", "detect", "device", "devote",
            "diagram", "dial", "diamond", "diary", "dice", "diesel", "diet", "differ", "digital", "dignity",
            "dilemma", "dinner", "dinosaur", "direct", "dirt", "disagree", "discover", "disease", "dish", "dismiss",
            "disorder", "display", "distance", "divert", "divide", "divorce", "dizzy", "doctor", "document", "dog",
            "doll", "dolphin", "domain", "donate", "donkey", "donor", "door", "dose", "double", "dove",
            "draft", "dragon", "drama", "drape", "draw", "dream", "dress", "drift", "drill", "drink",
            "drip", "drive", "drop", "drum", "dry", "duck", "dumb", "dune", "during", "dust",
            "dutch", "duty", "dwarf", "dynamic", "eager", "eagle", "early", "earn", "earth", "easily",
            "east", "easy", "echo", "ecology", "economy", "edge", "edit", "educate", "effort", "egg",
            "eight", "either", "elbow", "elder", "electric", "elegant", "element", "elephant", "elevator", "elite",
            "else", "embark", "embody", "embrace", "emerge", "emotion", "employ", "empower", "empty", "enable",
            "enact", "end", "endless", "endorse", "enemy", "energy", "enforce", "engage", "engine", "enhance",
            "enjoy", "enlist", "enough", "enrich", "enroll", "ensure", "enter", "entire", "entry", "envelope",
            "episode", "equal", "equip", "era", "erase", "erode", "erosion", "error", "erupt", "escape",
            "essay", "essence", "estate", "eternal", "ethics", "evidence", "evil", "evoke", "evolve", "exact",
            "example", "excess", "exchange", "excite", "exclude", "excuse", "execute", "exercise", "exhaust", "exhibit",
            "exile", "exist", "exit", "exotic", "expand", "expect", "expire", "explain", "expose", "express",
            "extend", "extra", "eye", "eyebrow", "fabric", "face", "faculty", "fade", "faint", "faith",
            "fall", "false", "fame", "family", "famous", "fan", "fancy", "fantasy", "farm", "fashion",
            "fat", "fatal", "father", "fatigue", "fault", "favorite", "feature", "february", "federal", "fee",
            "feed", "feel", "female", "fence", "festival", "fetch", "fever", "few", "fiber", "fiction",
            "field", "figure", "file", "fill", "film", "filter", "final", "find", "fine", "finger",
            "finish", "fire", "firm", "first", "fiscal", "fish", "fit", "fitness", "fix", "flag",
            "flame", "flat", "flavor", "flee", "flight", "flip", "float", "flock", "floor", "flower",
            "fluid", "flush", "fly", "foam", "focus", "fog", "foil", "fold", "follow", "food",
            "foot", "force", "forest", "forget", "fork", "fortune", "forum", "forward", "fossil", "foster",
            "found", "fox", "frame", "frequent", "fresh", "friend", "fringe", "frog", "front", "frost",
            "frown", "frozen", "fruit", "fuel", "fun", "funny", "furnace", "fury", "future", "gadget",
            "gain", "galaxy", "gallery", "game", "gap", "garage", "garbage", "garden", "garlic", "garment",
            "gas", "gasp", "gate", "gather", "gauge", "gaze", "general", "genius", "genre", "gentle",
            "genuine", "gesture", "ghost", "giant", "gift", "giggle", "ginger", "giraffe", "girl", "give",
            "glad", "glance", "glare", "glass", "glide", "glimpse", "globe", "gloom", "glory", "glove",
            "glow", "glue", "goat", "goddess", "gold", "good", "goose", "gorilla", "gospel", "gossip",
            "govern", "gown", "grab", "grace", "grain", "grant", "grape", "grass", "gravity", "great",
            "green", "grid", "grief", "grit", "grocery", "group", "grow", "grunt", "guard", "guess",
            "guide", "guilt", "guitar", "gun", "gym", "habit", "hair", "half", "hammer", "hamster",
            "hand", "happy", "harbor", "hard", "harsh", "harvest", "hat", "have", "hawk", "hazard",
            "head", "health", "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen",
            "hero", "hidden", "high", "hill", "hint", "hip", "hire", "history", "hobby", "hockey",
            "hold", "hole", "holiday", "hollow", "home", "honey", "hood", "hope", "horn", "horror",
            "horse", "hospital", "host", "hotel", "hour", "hover", "hub", "huge", "human", "humble",
            "humor", "hundred", "hungry", "hunt", "hurdle", "hurry", "hurt", "husband", "hybrid", "ice",
            "icon", "idea", "identify", "idle", "ignore", "ill", "illegal", "illness", "image", "imitate",
            "immense", "immune", "impact", "impose", "improve", "impulse", "inch", "include", "income", "increase",
            "index", "indicate", "indoor", "industry", "infant", "inflict", "inform", "inhale", "inherit", "initial",
            "inject", "injury", "inmate", "inner", "innocent", "input", "inquiry", "insane", "insect", "inside",
            "inspire", "install", "intact", "interest", "into", "invest", "invite", "involve", "iron", "island",
            "isolate", "issue", "item", "ivory", "jacket", "jaguar", "jar", "jazz", "jealous", "jeans",
            "jelly", "jewel", "job", "join", "joke", "journey", "joy", "judge", "juice", "jump",
            "jungle", "junior", "junk", "just", "kangaroo", "keen", "keep", "ketchup", "key", "kick",
            "kid", "kidney", "kind", "kingdom", "kiss", "kit", "kitchen", "kite", "kitten", "kiwi",
            "knee", "knife", "knock", "know", "lab", "label", "labor", "ladder", "lady", "lake",
            "lamp", "language", "laptop", "large", "later", "latin", "laugh", "laundry", "lava", "law",
            "lawn", "lawsuit", "layer", "lazy", "leader", "leaf", "learn", "leave", "lecture", "left",
            "leg", "legal", "legend", "leisure", "lemon", "lend", "length", "lens", "leopard", "lesson",
            "letter", "level", "liar", "liberty", "library", "license", "life", "lift", "light", "like",
            "limb", "limit", "link", "lion", "liquid", "list", "little", "live", "lizard", "load",
            "loan", "lobster", "local", "lock", "logic", "lonely", "long", "loop", "lottery", "loud",
            "lounge", "love", "loyal", "lucky", "luggage", "lumber", "lunar", "lunch", "luxury", "lying",
            "machine", "mad", "magic", "magnet", "maid", "mail", "main", "major", "make", "mammal",
            "man", "manage", "mandate", "mango", "mansion", "manual", "maple", "marble", "march", "margin",
            "marine", "market", "marriage", "mask", "mass", "master", "match", "material", "math", "matrix",
            "matter", "maximum", "maze", "meadow", "mean", "measure", "meat", "mechanic", "medal", "media",
            "melody", "melt", "member", "memory", "mention", "menu", "mercy", "merge", "merit", "merry",
            "mesh", "message", "metal", "method", "middle", "midnight", "milk", "million", "mimic", "mind",
            "minimum", "minor", "minute", "miracle", "mirror", "misery", "miss", "mistake", "mix", "mixed",
            "mixture", "mobile", "model", "modify", "mom", "moment", "monitor", "monkey", "monster", "month",
            "moon", "moral", "more", "morning", "mosquito", "mother", "motion", "motor", "mountain", "mouse",
            "move", "movie", "much", "muffin", "mule", "multiply", "muscle", "museum", "mushroom", "music",
            "must", "mutual", "myself", "mystery", "myth", "naive", "name", "napkin", "narrow", "nasty",
            "nation", "nature", "near", "neck", "need", "needle", "neglect", "neighbor", "neither", "nephew",
            "nerve", "nest", "net", "network", "neutral", "never", "news", "next", "nice", "night",
            "noble", "noise", "nominee", "noodle", "normal", "north", "nose", "notable", "note", "nothing",
            "notice", "novel", "now", "nuclear", "number", "nurse", "nut", "oak", "obey", "object",
            "oblige", "obscure", "observe", "obtain", "obvious", "occur", "ocean", "october", "odor", "off",
            "offer", "office", "often", "oil", "okay", "old", "olive", "olympic", "omit", "once",
            "one", "onion", "online", "only", "open", "opera", "opinion", "oppose", "option", "orange",
            "orbit", "orchard", "order", "ordinary", "organ", "orient", "original", "orphan", "ostrich", "other",
            "outdoor", "outer", "output", "outside", "oval", "oven", "over", "own", "owner", "oxygen",
            "oyster", "ozone", "pact", "paddle", "page", "pair", "palace", "palm", "panda", "panel",
            "panic", "panther", "paper", "parade", "parent", "park", "parrot", "part", "party", "pass",
            "patch", "path", "patient", "patrol", "pattern", "pause", "pave", "payment", "peace", "peanut",
            "pear", "peasant", "pelican", "pen", "penalty", "pencil", "people", "pepper", "perfect", "permit",
            "person", "pet", "phone", "photo", "phrase", "physical", "piano", "picnic", "picture", "piece",
            "pig", "pigeon", "pill", "pilot", "pink", "pioneer", "pipe", "pistol", "pitch", "pizza",
            "place", "planet", "plastic", "plate", "play", "please", "pledge", "pluck", "plug", "plunge",
            "poem", "poet", "point", "polar", "pole", "police", "pond", "pony", "pool", "popular",
            "portion", "position", "possible", "post", "potato", "pottery", "poverty", "powder", "power", "practice",
            "praise", "predict", "prefer", "prepare", "present", "pretty", "prevent", "price", "pride", "primary",
            "print", "priority", "prison", "private", "prize", "problem", "process", "produce", "profit", "program",
            "project", "promote", "proof", "property", "prosper", "protect", "proud", "provide", "public", "pudding",
            "pull", "pulp", "pulse", "pumpkin", "punch", "pupil", "puppy", "purchase", "purity", "purpose",
            "purse", "push", "put", "puzzle", "pyramid", "quality", "quantum", "quarter", "question", "quick",
            "quit", "quiz", "quote", "rabbit", "raccoon", "race", "rack", "radar", "radio", "rail",
            "rain", "raise", "rally", "ramp", "ranch", "random", "range", "rapid", "rare", "rate",
            "rather", "raven", "raw", "razor", "ready", "real", "reason", "rebel", "rebuild", "recall",
            "receive", "recipe", "record", "recycle", "reduce", "reflect", "reform", "refuse", "region", "regret",
            "regular", "reject", "relax", "release", "relief", "rely", "remain", "remember", "remind", "remove",
            "render", "renew", "rent", "reopen", "repair", "repeat", "replace", "report", "require", "rescue",
            "resemble", "resist", "resource", "response", "result", "retire", "retreat", "return", "reunion", "reveal",
            "review", "reward", "rhythm", "rib", "ribbon", "rice", "rich", "ride", "ridge", "rifle",
            "right", "rigid", "ring", "riot", "ripple", "rise", "risk", "ritual", "rival", "river",
            "road", "roast", "rob", "robust", "rocket", "romance", "roof", "rookie", "room", "rose",
            "rotate", "rough", "round", "route", "royal", "rubber", "rude", "rug", "rule", "run",
            "runway", "rural", "sad", "saddle", "sadness", "safe", "sail", "salad", "salmon", "salon",
            "salt", "salute", "same", "sample", "sand", "satisfy", "satoshi", "sauce", "sausage", "save",
            "say", "scale", "scan", "scare", "scatter", "scene", "scheme", "school", "science", "scissors",
            "scorpion", "scout", "scrap", "screen", "script", "scrub", "sea", "search", "season", "seat",
            "second", "secret", "section", "security", "seed", "seek", "segment", "select", "sell", "seminar",
            "senior", "sense", "sentence", "series", "service", "session", "settle", "setup", "seven", "shadow",
            "shaft", "shallow", "share", "shed", "shell", "sheriff", "shield", "shift", "shine", "ship",
            "shirt", "shock", "shoe", "shoot", "shop", "short", "shoulder", "shove", "shrimp", "shrug",
            "shuffle", "shy", "sibling", "sick", "side", "siege", "sight", "sign", "silent", "silk",
            "silly", "silver", "similar", "simple", "since", "sing", "siren", "sister", "situate", "six",
            "size", "skate", "sketch", "ski", "skill", "skin", "skirt", "skull", "slab", "slam",
            "sleep", "slender", "slice", "slide", "slight", "slim", "slogan", "slot", "slow", "slush",
            "small", "smart", "smile", "smoke", "smooth", "snack", "snake", "snap", "sniff", "snow",
            "soap", "soccer", "social", "sock", "soda", "soft", "solar", "sold", "soldier", "solid",
            "solution", "solve", "someone", "son", "song", "soon", "sorry", "sort", "soul", "sound",
            "soup", "source", "south", "space", "spare", "spatial", "spawn", "speak", "special", "speed",
            "spell", "spend", "sphere", "spice", "spider", "spike", "spin", "spirit", "split", "spoil",
            "sponsor", "spoon", "sport", "spot", "spray", "spread", "spring", "spy", "square", "squeeze",
            "squirrel", "stable", "stadium", "staff", "stage", "stairs", "stamp", "stand", "start", "state",
            "stay", "steak", "steel", "stem", "step", "stereo", "stick", "still", "sting", "stock",
            "stomach", "stone", "stool", "story", "stove", "strategy", "street", "strike", "strong", "struggle",
            "student", "stuff", "stumble", "style", "subject", "submit", "subway", "success", "such", "sudden",
            "suffer", "sugar", "suggest", "suit", "summer", "sun", "sunny", "sunset", "super", "supply",
            "supreme", "sure", "surface", "surge", "surprise", "surround", "survey", "suspect", "sustain", "swallow",
            "swamp", "swap", "swear", "sweet", "swift", "swim", "swing", "switch", "sword", "symbol",
            "symptom", "syrup", "system", "table", "tackle", "tag", "tail", "talent", "talk", "tank",
            "tape", "target", "task", "taste", "tattoo", "taxi", "teach", "team", "tell", "ten",
            "tenant", "tennis", "tent", "term", "test", "text", "thank", "that", "theme", "then",
            "theory", "there", "they", "thing", "this", "thought", "three", "thrive", "throw", "thumb",
            "thunder", "ticket", "tide", "tiger", "tilt", "timber", "time", "tiny", "tip", "tired",
            "tissue", "title", "toast", "tobacco", "today", "toddler", "toe", "together", "toilet", "token",
            "tomato", "tomorrow", "tone", "tongue", "tonight", "tool", "tooth", "top", "topic", "topple",
            "torch", "tornado", "tortoise", "toss", "total", "tourist", "toward", "tower", "town", "toy",
            "track", "trade", "traffic", "tragic", "train", "transfer", "trap", "trash", "travel", "tray",
            "treat", "tree", "trend", "trial", "tribe", "trick", "trigger", "trim", "trip", "trophy",
            "trouble", "truck", "true", "truly", "trumpet", "trust", "truth", "try", "tube", "tuition",
            "tumble", "tuna", "tunnel", "turkey", "turn", "turtle", "twelve", "twenty", "twice", "twin",
            "twist", "two", "type", "typical", "ugly", "umbrella", "unable", "unaware", "uncle", "uncover",
            "under", "undo", "unfair", "unfold", "unhappy", "uniform", "unique", "unit", "universe", "unknown",
            "unlock", "until", "unusual", "unveil", "update", "upgrade", "uphold", "upon", "upper", "upset",
            "urban", "urge", "usage", "use", "used", "useful", "useless", "usual", "utility", "vacant",
            "vacuum", "vague", "valid", "valley", "valve", "van", "vanish", "vapor", "various", "vast",
            "vault", "vehicle", "velvet", "vendor", "venture", "venue", "verb", "verify", "version", "very",
            "vessel", "veteran", "viable", "vibrant", "vicious", "victory", "video", "view", "village", "vintage",
            "violin", "virtual", "virus", "visa", "visit", "visual", "vital", "vivid", "vocal", "voice",
            "void", "volcano", "volume", "vote", "voyage", "wage", "wagon", "wait", "walk", "wall",
            "walnut", "want", "warfare", "warm", "warrior", "wash", "wasp", "waste", "water", "wave",
            "way", "wealth", "weapon", "wear", "weasel", "weather", "web", "wedding", "weekend", "weird",
            "welcome", "west", "wet", "what", "wheat", "wheel", "when", "where", "whip", "whisper",
            "wide", "width", "wife", "wild", "will", "win", "window", "wine", "wing", "wink",
            "winner", "winter", "wire", "wisdom", "wise", "wish", "witness", "wolf", "woman", "wonder",
            "wood", "wool", "word", "work", "world", "worry", "worth", "wrap", "wreck", "wrestle",
            "wrist", "write", "wrong", "yard", "year", "yellow", "you", "young", "youth", "zebra",
            "zero", "zone", "zoo"
        ];
        const entropy = this.hexToBytes(entropyHex);
        const entropyBits = Array.from(entropy)
            .map(byte => byte.toString(2).padStart(8, '0'))
            .join('');
        const hash = await this.sha256(entropy);
        const hashBits = Array.from(hash)
            .map(byte => byte.toString(2).padStart(8, '0'))
            .join('');
        const checksumLength = entropy.length / 4;
        const checksum = hashBits.slice(0, checksumLength);
        
        const fullBits = entropyBits + checksum;
        const words = [];
        for (let i = 0; i < fullBits.length; i += 11) {
            const bits = fullBits.slice(i, i + 11);
            if (bits.length === 11) {
                const index = parseInt(bits, 2);
                words.push(wordlist[index]);
            }
        }
        
        return words.join(' ');
    }

    /**
     * Convert mnemonic to seed using PBKDF2 (BIP39 spec
     * @param {string} mnemonic
     * @param {string} passphrase
     * @returns {Promise<Uint8Array>}
     */
    async mnemonicToSeed(mnemonic, passphrase = "") {
        const mnemonicBuffer = this.stringToBytes(mnemonic);
        const saltBuffer = this.stringToBytes("mnemonic" + passphrase);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            mnemonicBuffer,
            'PBKDF2',
            false,
            ['deriveBits']
        );
        
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: 2048, 
                hash: 'SHA-512'   
            },
            keyMaterial,
            512 // 64 bytes (512 bits)
        );
        
        return new Uint8Array(derivedBits);
    }

    /**
     * Derive master key using "Octra seed" HMAC
     * @param {Uint8Array} seed
     * @returns {Object}
     */
    async deriveMasterKey(seed) {
        const key = this.stringToBytes("Octra seed");
        const hmac = await this.hmacSha512(key, seed);
        
        return {
            privateKey: hmac.slice(0, 32),  // First 32 bytes
            chainCode: hmac.slice(32, 64)   // Last 32 bytes
        };
    }

    /**
     * Sign a transaction
     * @param {Object} transaction
     * @returns {Object}
     */
    signTransaction(transaction) {
        try {
            if (!this.signingKey) {
                throw new Error('No signing key available');
            }
            const signingPayload = {};
            for (const [key, value] of Object.entries(transaction)) {
                if (key !== 'message' && key !== 'signature' && key !== 'public_key') {
                    signingPayload[key] = value;
                }
            }
            const payloadJson = JSON.stringify(signingPayload);
            const payloadBytes = this.stringToBytes(payloadJson);
            const signature = nacl.sign.detached(payloadBytes, this.signingKey.secretKey);
            const hash = this.bytesToHex(this.sha256Sync(payloadBytes));

            return {
                signature: this.bytesToBase64(signature),
                hash: hash
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Verify a signature
     * @param {Object} transaction
     * @param {string} signature
     * @param {string} publicKey
     * @returns {boolean}
     */
    verifySignature(transaction, signature, publicKey) {
        try {
            const signingPayload = { ...transaction };
            delete signingPayload.message;
            delete signingPayload.signature;
            delete signingPayload.public_key;
            const payloadJson = JSON.stringify(signingPayload, Object.keys(signingPayload).sort());
            const payloadBytes = this.stringToBytes(payloadJson);
            const signatureBytes = this.base64ToBytes(signature);
            const publicKeyBytes = this.base64ToBytes(publicKey);

            return nacl.sign.detached.verify(payloadBytes, signatureBytes, publicKeyBytes);
        } catch (error) {
            return false;
        }
    }

    /**
     * Derive address from public key (official Octra spec)
     * @param {string} publicKey
     * @returns {string}
     */
    async deriveAddress(publicKey) {
        try {
            const publicKeyBytes = this.base64ToBytes(publicKey);
            const hash = await this.sha256(publicKeyBytes);
            const base58Hash = this.bytesToBase58(hash);
            return 'oct' + base58Hash;
        } catch (error) {
            return null;
        }
    }

    /**
     * Verify address format (official spec)
     * @param {string} address
     * @returns {boolean}
     */
    verifyAddressFormat(address) {
        if (!address.startsWith("oct")) {
            return false;
        }
        if (address.length < 47 || address.length > 49) {
            return false;
        }
        const base58Part = address.slice(3);
        const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        
        for (const char of base58Part) {
            if (!base58Alphabet.includes(char)) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Get public key
     * @returns {string}
     */
    getPublicKey() {
        return this.publicKey;
    }

    /**
     * Get private key
     * @returns {string}
     */
    getPrivateKey() {
        return this.privateKey;
    }

    /**
     * Check if keys are loaded
     * @returns {boolean}
     */
    isReady() {
        return this.signingKey !== null && this.privateKey !== null && this.publicKey !== null;
    }

    /**
     * Convert base64 to bytes
     * @param {string} base64
     * @returns {Uint8Array}
     */
    base64ToBytes(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Convert bytes to base64
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    bytesToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert string to bytes
     * @param {string} str
     * @returns {Uint8Array}
     */
    stringToBytes(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }

    /**
     * Convert bytes to hex
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    bytesToHex(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Convert hex to bytes
     * @param {string} hex
     * @returns {Uint8Array}
     */
    hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        }
        return bytes;
    }

    /**
     * SHA-256 hash using Web Crypto API
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    async sha256(data) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return new Uint8Array(hashBuffer);
    }

    /**
     * Synchronous SHA-256 using nacl (fallback)
     * @param {Uint8Array} data
     * @returns {Uint8Array}
     */
    sha256Sync(data) {
        return nacl.hash(data).slice(0, 32); // Take first 32 bytes
    }

    /**
     * HMAC-SHA512 using Web Crypto API
     * @param {Uint8Array} key
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    async hmacSha512(key, data) {
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-512' },
            false,
            ['sign']
        );
        
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
        return new Uint8Array(signature);
    }

    /**
     * Base58 encoding
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    bytesToBase58(bytes) {
        const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        
        if (bytes.length === 0) return '';
        let num = 0n;
        for (let i = 0; i < bytes.length; i++) {
            num = num * 256n + BigInt(bytes[i]);
        }
        let encoded = '';
        while (num > 0n) {
            const remainder = num % 58n;
            num = num / 58n;
            encoded = alphabet[Number(remainder)] + encoded;
        }
        for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
            encoded = '1' + encoded;
        }
        
        return encoded;
    }

    /**
     * Derive seed from entropy 
     * @param {Uint8Array} entropy
     * @returns {Promise<Uint8Array>}
     */
    async deriveSeedFromEntropy(entropy) {
        const key = this.stringToBytes("entropy_to_seed");
        return await this.hmacSha512(key, entropy);
    }

    /**
     * Generate mock mnemonic
     * @returns {string}
     */
    generateMockMnemonic() {
        const words = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
        return words.join(' ');
    }

    /**
     * Import wallet from private key
     * @param {string} privateKeyBase64
     * @returns {Object}
     */
    importWallet(privateKeyBase64) {
        try {
            if (!privateKeyBase64 || typeof privateKeyBase64 !== 'string') {
                throw new Error('Private key must be a non-empty string');
            }
            const privateKeyBytes = this.base64ToBytes(privateKeyBase64);
            this.signingKey = nacl.sign.keyPair.fromSeed(privateKeyBytes);
            const publicKeyRaw = this.signingKey.publicKey;
            const publicKeyB64 = this.bytesToBase64(publicKeyRaw);
            this.privateKey = privateKeyBase64;
            this.publicKey = publicKeyB64;
            const address = this.deriveAddressSync(publicKeyB64);
            
            return {
                private_key_b64: privateKeyBase64,
                public_key_b64: publicKeyB64,
                address: address
            };
        } catch (error) {
            throw new Error(`Failed to import wallet from private key: ${error.message}`);
        }
    }

    /**
     * Derive address synchronously (for private key imports)
     * @param {string} publicKey
     * @returns {string}
     */
    deriveAddressSync(publicKey) {
        try {
            const publicKeyBytes = this.base64ToBytes(publicKey);
            const hash = this.sha256Sync(publicKeyBytes);
            const base58Hash = this.bytesToBase58(hash);
            return 'oct' + base58Hash;
        } catch (error) {
            throw new Error(`Failed to derive address: ${error.message}`);
        }
    }

    /**
     * Generate wallet 
     * @returns {Promise<Object>}
     */
    async generateWallet() {
        return await this.generateKeyPair();
    }

    /**
     * Derive encryption key for private balance operations
     * @param {string} privateKeyBase64
     * @returns {Uint8Array}
     */
    deriveEncryptionKey(privateKeyBase64) {
        const privateKeyBytes = this.base64ToBytes(privateKeyBase64);
        const salt = this.stringToBytes("octra_encrypted_balance_v2");
        const combined = new Uint8Array(salt.length + privateKeyBytes.length);
        combined.set(salt);
        combined.set(privateKeyBytes, salt.length);
        const hash = this.sha256Sync(combined);
        return hash.slice(0, 32);
    }

    /**
     * Derive shared secret for private transfers
     * @param {string} myPrivateKeyBase64
     * @param {string} ephemeralPublicKeyBase64
     * @returns {Uint8Array}
     */
    deriveSharedSecretForClaim(myPrivateKeyBase64, ephemeralPublicKeyBase64) {
        try {
            const sk = nacl.sign.keyPair.fromSeed(this.base64ToBytes(myPrivateKeyBase64));
            const myPublicKeyBytes = sk.publicKey;
            const ephPublicKeyBytes = this.base64ToBytes(ephemeralPublicKeyBase64);
            let smaller, larger;
            if (this.bytesLessThan(ephPublicKeyBytes, myPublicKeyBytes)) {
                smaller = ephPublicKeyBytes;
                larger = myPublicKeyBytes;
            } else {
                smaller = myPublicKeyBytes;
                larger = ephPublicKeyBytes;
            }
            const combined = new Uint8Array(smaller.length + larger.length);
            combined.set(smaller);
            combined.set(larger, smaller.length);
            const round1 = this.sha256Sync(combined);
            const salt = this.stringToBytes("OCTRA_SYMMETRIC_V1");
            const round2Input = new Uint8Array(round1.length + salt.length);
            round2Input.set(round1);
            round2Input.set(salt, round1.length);
            
            const round2 = this.sha256Sync(round2Input);
            return round2.slice(0, 32); 
        } catch (error) {
            return null;
        }
    }

    /**
     * Compare bytes like Python's < operator (CLI uses eph_pub_bytes < my_pubkey_bytes)
     */
    bytesLessThan(a, b) {
        const minLen = Math.min(a.length, b.length);
        for (let i = 0; i < minLen; i++) {
            if (a[i] < b[i]) return true;
            if (a[i] > b[i]) return false;
        }
        return a.length < b.length;
    }

    /**
     * Decrypt private transfer amount
     * @param {string} encryptedData
     * @param {Uint8Array} sharedSecret
     * @returns {number|null}
     */
    async decryptPrivateAmount(encryptedData, sharedSecret) {
        try {
            if (!encryptedData || !encryptedData.startsWith("v2|")) {
                return null;
            }
            
            const data = this.base64ToBytes(encryptedData.slice(3));
            if (data.length < 28) { 
                return null;
            }
            
            const nonce = data.slice(0, 12);
            const ciphertext = data.slice(12);
            try {
                const key = await crypto.subtle.importKey(
                    'raw',
                    sharedSecret,
                    { name: 'AES-GCM' },
                    false,
                    ['decrypt']
                );
                
                const plaintext = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: nonce },
                    key,
                    ciphertext
                );
                
                return parseInt(new TextDecoder().decode(plaintext), 10);
            } catch (error) {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * AES-GCM decryption 
     * @param {Uint8Array} ciphertext
     * @param {Uint8Array} key
     * @param {Uint8Array} nonce
     * @returns {Uint8Array}
     */
    async aesGcmDecrypt(ciphertext, key, nonce) {
        try {
            if (ciphertext.length < 16) {
                throw new Error(`Ciphertext too short: ${ciphertext.length} bytes, minimum 16 required for AES-GCM`);
            }
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                key,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );
            const tagLengths = [128, 96, 64]; 
            
            for (const tagLength of tagLengths) {
                const tagBytes = tagLength / 8;
                if (ciphertext.length >= tagBytes) {
                    try {
                        const decrypted = await crypto.subtle.decrypt(
                            {
                                name: 'AES-GCM',
                                iv: nonce,
                                tagLength: tagLength
                            },
                            cryptoKey,
                            ciphertext
                        );
                        
                        return new Uint8Array(decrypted);
                    } catch (tagError) {
                    }
                }
            }
            throw new Error('AES-GCM decryption failed with all tag lengths');
            
        } catch (error) {
            try {
                const keystream = this.generateKeystream(key, nonce, ciphertext.length);
                const decrypted = new Uint8Array(ciphertext.length);
                
                for (let i = 0; i < ciphertext.length; i++) {
                    decrypted[i] = ciphertext[i] ^ keystream[i];
                }
                
                return decrypted;
            } catch (fallbackError) {
                throw error; 
            }
        }
    }

    /**
     * Compare two byte arrays
     * @param {Uint8Array} a
     * @param {Uint8Array} b
     * @returns {number}
     */
    compareBytes(a, b) {
        const minLength = Math.min(a.length, b.length);
        
        for (let i = 0; i < minLength; i++) {
            if (a[i] < b[i]) return -1;
            if (a[i] > b[i]) return 1;
        }
        
        return a.length - b.length;
    }

    /**
     * Decrypt v1 format balance 
     * @param {string} encryptedData
     * @param {string} privateKeyBase64
     * @returns {number}
     */
    decryptClientBalanceV1(encryptedData, privateKeyBase64) {
        try {
            const privateKeyBytes = this.base64ToBytes(privateKeyBase64);
            const salt = this.stringToBytes("octra_encrypted_balance_v1");
            const key1 = this.sha256Sync(new Uint8Array([...salt, ...privateKeyBytes]));
            const key2 = this.sha256Sync(new Uint8Array([...privateKeyBytes, ...salt]));
            const key = new Uint8Array([...key1, ...key2]).slice(0, 32);
            
            const data = this.base64ToBytes(encryptedData);
            if (data.length < 32) {
                return 0;
            }
            
            const nonce = data.slice(0, 16);
            const tag = data.slice(16, 32);
            const encrypted = data.slice(32);
            const keyHash = this.sha256Sync(new Uint8Array([...key, ...nonce]));
            const expectedTag = this.sha256Sync(new Uint8Array([...nonce, ...encrypted, ...key])).slice(0, 16);
            
            if (!this.constantTimeEqual(tag, expectedTag)) {
                return 0;
            }
            const decrypted = new Uint8Array(encrypted.length);
            for (let i = 0; i < encrypted.length; i++) {
                decrypted[i] = encrypted[i] ^ keyHash[i % 32];
            }
            
            const balanceString = new TextDecoder().decode(decrypted);
            return parseInt(balanceString, 10);
        } catch (error) {
            return 0;
        }
    }

    /**
     * Constant time comparison to prevent timing attacks
     * @param {Uint8Array} a
     * @param {Uint8Array} b
     * @returns {boolean}
     */
    constantTimeEqual(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        
        return result === 0;
    }

    /**
     * Securely clear a string from memory by overwriting
     * @param {string} str
     * @returns {string}
     */
    secureClearString(str) {
        if (!str || typeof str !== 'string') return null;
        const length = str.length;
        let temp = new Array(length);
        for (let i = 0; i < length; i++) {
            temp[i] = String.fromCharCode(Math.floor(Math.random() * 256));
        }
        temp.fill('\0');
        temp = null;

        return null;
    }

    /**
     * Securely clear a Uint8Array from memory
     * @param {Uint8Array} arr
     * @returns {null}
     */
    secureClearBytes(arr) {
        if (!arr || !(arr instanceof Uint8Array)) return null;
        crypto.getRandomValues(arr);
        arr.fill(0);

        return null;
    }

    /**
     * Clear all keys from memory securely
     */
    clear() {
        if (this.signingKey) {
            if (this.signingKey.secretKey instanceof Uint8Array) {
                this.secureClearBytes(this.signingKey.secretKey);
            }
            if (this.signingKey.publicKey instanceof Uint8Array) {
                this.secureClearBytes(this.signingKey.publicKey);
            }
            this.signingKey = null;
        }
        this.privateKey = this.secureClearString(this.privateKey);
        this.publicKey = this.secureClearString(this.publicKey);
    }

    /**
     * Convert hex string to bytes
     * @param {string} hex
     * @returns {Uint8Array}
     */
    hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    /**
     * Convert bytes to hex string
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    bytesToHex(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Convert string to bytes
     * @param {string} str
     * @returns {Uint8Array}
     */
    stringToBytes(str) {
        return new TextEncoder().encode(str);
    }





    /**
     * HMAC-SHA512
     * @param {Uint8Array} key
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    async hmacSha512(key, data) {
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-512' },
            false,
            ['sign']
        );
        
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
        return new Uint8Array(signature);
    }

    /**
     * Derive encryption key for private balance encryption
     * @param {string} privateKeyB64
     * @returns {Uint8Array}
     */
    async deriveEncryptionKey(privateKeyB64) {
        const privateKeyBytes = this.base64ToBytes(privateKeyB64);
        const salt = new TextEncoder().encode("octra_encrypted_balance_v2");
        const combined = new Uint8Array(salt.length + privateKeyBytes.length);
        combined.set(salt);
        combined.set(privateKeyBytes, salt.length);
        const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
        return new Uint8Array(hashBuffer).slice(0, 32); // First 32 bytes
    }

    /**
     * Encrypt balance using AES-GCM 
     * @param {number} balanceRaw
     * @param {string} privateKeyB64
     * @returns {Promise<string>}
     */
    async encryptClientBalance(balanceRaw, privateKeyB64) {
        try {
            const key = await this.deriveEncryptionKey(privateKeyB64);
            const balanceStr = balanceRaw.toString();
            const plaintext = new TextEncoder().encode(balanceStr);
            const nonce = crypto.getRandomValues(new Uint8Array(12));
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                key,
                { name: 'AES-GCM' },
                false,
                ['encrypt']
            );
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: nonce },
                cryptoKey,
                plaintext
            );
            const combined = new Uint8Array(nonce.length + ciphertext.byteLength);
            combined.set(nonce);
            combined.set(new Uint8Array(ciphertext), nonce.length);
            return "v2|" + this.bytesToBase64(combined);
            
        } catch (error) {
            throw new Error('Failed to encrypt balance: ' + error.message);
        }
    }

    /**
     * Decrypt balance using AES-GCM 
     * @param {string} encryptedData
     * @param {string} privateKeyB64
     * @returns {Promise<number>}
     */
    async decryptClientBalance(encryptedData, privateKeyB64) {
        try {
            if (!encryptedData.startsWith("v2|")) {
                throw new Error("Unsupported encryption version");
            }
            const b64Data = encryptedData.substring(3);
            const combined = this.base64ToBytes(b64Data);
            const nonce = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const key = await this.deriveEncryptionKey(privateKeyB64);
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                key,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: nonce },
                cryptoKey,
                ciphertext
            );
            const balanceStr = new TextDecoder().decode(plaintext);
            return parseInt(balanceStr);
            
        } catch (error) {
            throw new Error('Failed to decrypt balance: ' + error.message);
        }
    }

    /**
     * Decrypt with shared secret (helper for debugging)
     */
    async decryptWithSharedSecret(ciphertext, nonce, sharedSecret) {
        try {
            const key = await crypto.subtle.importKey(
                'raw',
                sharedSecret,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );
            
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: nonce },
                key,
                ciphertext
            );
            
            return parseInt(new TextDecoder().decode(plaintext), 10);
        } catch (error) {
            return null;
        }
    }
}
window.CryptoManager = CryptoManager; 
try {
    const globalCrypto = new CryptoManager();
    window.octraCrypto = {
        generateWallet: async function() {
            return await globalCrypto.generateKeyPair();
        },
        
        importWallet: function(privateKey) {
            return globalCrypto.importWallet(privateKey);
        }
    };
    if (window.crypto && typeof window.crypto === 'object') {
        if (!window.crypto.generateWallet) {
            window.crypto.generateWallet = window.octraCrypto.generateWallet;
        }
        if (!window.crypto.importWallet) {
            window.crypto.importWallet = window.octraCrypto.importWallet;
        }
    } else {
        window.crypto = window.octraCrypto;
    }
} catch (error) {
} 