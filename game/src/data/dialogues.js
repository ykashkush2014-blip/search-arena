/**
 * dialogues.js — conversation graphs. Effects use the schema from
 * systems/dialogue.js (EffectTypes). Generated NPC variations are merged in
 * by tools/gen-content.js.
 */
export const DIALOGUES = {
  // --------------------------------------------------------- elder Sadiq
  'dlg-elder-intro': {
    id: 'dlg-elder-intro',
    nodes: {
      start: {
        speaker: { en: 'Elder Sadiq', ar: 'الشيخ صديق' },
        text: {
          en: 'The well cracked three nights ago. Since then, the dunes sing — and the scorpions dance.',
          ar: 'البئر تصدّع قبل ثلاث ليالٍ. ومنذ ذلك الحين، الكثبان تغني — والعقارب ترقص.',
        },
        choices: [
          {
            text: { en: 'What does the song mean?', ar: 'ماذا يعني الغناء؟' },
            next: 'meaning',
          },
          {
            text: { en: 'What should I do?', ar: 'ماذا عليّ أن أفعل؟' },
            next: 'advice',
          },
          {
            text: { en: 'Farewell.', ar: 'وداعًا.' },
            next: 'end',
          },
        ],
      },
      meaning: {
        speaker: { en: 'Elder Sadiq', ar: 'الشيخ صديق' },
        text: {
          en: 'The aether in the sand remembers the ocean of stars. When it wakes, the storm listens.',
          ar: 'الأثير في الرمل يتذكّر محيط النجوم. حين يستيقظ، تنصت العاصفة.',
        },
        next: 'advice',
      },
      advice: {
        speaker: { en: 'Elder Sadiq', ar: 'الشيخ صديق' },
        text: {
          en: 'Take this bread. Hunt the scorpions — they carry the storm\'s temper. And seek Rasha the merchant.',
          ar: 'خذ هذا الخبز. اصطد العقارب — فهي تحمل مزاج العاصفة. والتمس التاجر رشا.',
        },
        choices: [
          {
            text: { en: 'I will.', ar: 'سأفعل.' },
            next: 'end',
            effects: [
              { type: 'giveItem', itemId: 'sand-bread', count: 2 },
              { type: 'startQuest', questId: 'q-first-steps' },
              { type: 'setFlag', flag: 'met_elder' },
            ],
          },
        ],
      },
      end: {
        speaker: { en: 'Elder Sadiq', ar: 'الشيخ صديق' },
        text: { en: 'Walk carefully. The sand remembers footsteps.', ar: 'امشِ بحذر. الرمل يتذكّر الخطوات.' },
        next: 'end',
        setFlags: ['met_elder'],
      },
    },
  },
  'dlg-elder-weather': {
    id: 'dlg-elder-weather',
    nodes: {
      start: {
        speaker: { en: 'Elder Sadiq', ar: 'الشيخ صديق' },
        text: {
          en: 'When the wind carries sand to the east, shelter. When it carries sand to the west, hunt.',
          ar: 'حين تحمل الريح الرمل شرقًا،احتمِ. وحين تحمله غربًا،اصطد.',
        },
        choices: [
          {
            text: { en: 'Why the west?', ar: 'لماذا الغرب؟' },
            next: 'why',
          },
          { text: { en: 'Understood.', ar: 'فهمت.' }, next: 'end' },
        ],
      },
      why: {
        speaker: { en: 'Elder Sadiq', ar: 'الشيخ صديق' },
        text: {
          en: 'Blessed winds follow the western sand. Gold finds the patient hunter.',
          ar: 'الرياح المباركة تتبع الرمل الغربي. الذهب يجد الصياد الصبور.',
        },
        next: 'end',
      },
      end: {
        speaker: { en: 'Elder Sadiq', ar: 'الشيخ صديق' },
        text: { en: 'Go with the wind, child.', ar: 'امضِ مع الريح، يا بني.' },
        next: 'end',
      },
    },
  },

  // -------------------------------------------------------- merchant Rasha
  'dlg-merchant-01': {
    id: 'dlg-merchant-01',
    nodes: {
      start: {
        speaker: { en: 'Rasha the Merchant', ar: 'التاجر رشا' },
        text: {
          en: 'Ah, a customer! I sell steel, potions and questionable advice.',
          ar: 'آه، زبون! أبيع الفولاذ والجرعات ونصائح مشكوك فيها.',
        },
        choices: [
          {
            text: { en: 'Show me your goods.', ar: 'أرني بضاعتك.' },
            next: 'shop',
            effects: [{ type: 'openShop', shopId: 'shop-rasha' }],
          },
          {
            text: { en: 'Any work for me?', ar: 'هل لديك عمل لي؟' },
            next: 'work',
            condition: { notFlag: 'q_tail_offered' },
          },
          {
            text: { en: 'Just passing by.', ar: 'مجرد مرور.' },
            next: 'end',
          },
        ],
      },
      shop: {
        speaker: { en: 'Rasha the Merchant', ar: 'التاجر رشا' },
        text: { en: 'Everything is priced with love. And profit. Mostly profit.', ar: 'كل شيء مسعّر بحب. وربح. غالبًا ربح.' },
        next: 'end',
      },
      work: {
        speaker: { en: 'Rasha the Merchant', ar: 'التاجر رشا' },
        text: {
          en: 'Bring me four scorpion tails. Their venom keeps the sand-glass clear.',
          ar: 'أحضرني أربعة ذيول عقارب. سمها يبقي زجاج الرمل صافيًا.',
        },
        choices: [
          {
            text: { en: 'Deal.', ar: 'اتفاق.' },
            next: 'end',
            setFlags: ['q_tail_offered'],
            effects: [{ type: 'startQuest', questId: 'q-tail-collection' }],
          },
          { text: { en: 'Not now.', ar: 'ليس الآن.' }, next: 'end' },
        ],
      },
      end: {
        speaker: { en: 'Rasha the Merchant', ar: 'التاجر رشا' },
        text: { en: 'Come back rich!', ar: 'عد غنيًا!' },
        next: 'end',
      },
    },
  },
  'dlg-merchant-storm': {
    id: 'dlg-merchant-storm',
    nodes: {
      start: {
        speaker: { en: 'Rasha the Merchant', ar: 'التاجر رشا' },
        text: {
          en: 'Storm coming. I can tell by the way my prices tremble.',
          ar: 'عاصفة قادمة. أعرف من ارتجاف أسعاري.',
        },
        choices: [
          {
            text: { en: 'Stock me up, then.', ar: 'زوّدني إذن.' },
            next: 'end',
            effects: [{ type: 'openShop', shopId: 'shop-rasha' }],
          },
          { text: { en: 'Good luck.', ar: 'حظًا سعيدًا.' }, next: 'end' },
        ],
      },
      end: {
        speaker: { en: 'Rasha the Merchant', ar: 'التاجر رشا' },
        text: { en: 'May your flask never empty.', ar: 'لتكن قارورتك لا تفرغ أبدًا.' },
        next: 'end',
      },
    },
  },

  // ------------------------------------------------------------ smith Bilal
  'dlg-smith-01': {
    id: 'dlg-smith-01',
    nodes: {
      start: {
        speaker: { en: 'Bilal the Smith', ar: 'الحدّاد بلال' },
        text: {
          en: 'Steel is honest. It bends when it must and cuts when it can.',
          ar: 'الفولاذ صادق. ينحني حين يجب ويقطع حين يستطيع.',
        },
        choices: [
          {
            text: { en: 'Can you teach me to craft?', ar: 'هل تستطيع تعليمي الصناعة؟' },
            next: 'teach',
          },
          {
            text: { en: 'I brought materials.', ar: 'أحضرت مواد.' },
            next: 'work',
            condition: { notFlag: 'q_scrap_offered' },
          },
          { text: { en: 'Farewell.', ar: 'وداعًا.' }, next: 'end' },
        ],
      },
      teach: {
        speaker: { en: 'Bilal the Smith', ar: 'الحدّاد بلال' },
        text: {
          en: 'Take this scroll. Recipes are just arguments with metal.',
          ar: 'خذ هذه اللفافة. الوصفات مجرد جدال مع المعدن.',
        },
        next: 'end',
        effects: [{ type: 'giveItem', itemId: 'ancient-scroll', count: 1 }],
      },
      work: {
        speaker: { en: 'Bilal the Smith', ar: 'الحدّاد بلال' },
        text: {
          en: 'Anything hard enough to forge. Tails, fangs, shards — I will make it useful.',
          ar: 'أي شيء صعب بما يكفي للطرق. ذيول، أنياب، شظايا — سأجعله مفيدًا.',
        },
        choices: [
          {
            text: { en: 'I\'ll gather them.', ar: 'سأجمعها.' },
            next: 'end',
            setFlags: ['q_scrap_offered'],
            effects: [{ type: 'startQuest', questId: 'q-scrap-metal' }],
          },
          { text: { en: 'Maybe later.', ar: 'ربما لاحقًا.' }, next: 'end' },
        ],
      },
      end: {
        speaker: { en: 'Bilal the Smith', ar: 'الحدّاد بلال' },
        text: { en: 'Keep your edge clean.', ar: 'حافظ على حدّك نظيفًا.' },
        next: 'end',
      },
    },
  },

  // ------------------------------------------------------------- healer Amal
  'dlg-healer-01': {
    id: 'dlg-healer-01',
    nodes: {
      start: {
        speaker: { en: 'Amal the Healer', ar: 'المعالجة أمل' },
        text: {
          en: 'You look like the desert chewed on you. Sit.',
          ar: 'تبدو كأن الصحراء مضغتك. اجلس.',
        },
        choices: [
          {
            text: { en: 'Please heal me.', ar: 'من فضلك اشفني.' },
            next: 'heal',
            effects: [{ type: 'heal', amount: 999 }],
          },
          {
            text: { en: 'What is the sand singing?', ar: 'على ماذا يغني الرمل؟' },
            next: 'song',
          },
          { text: { en: 'I\'m fine.', ar: 'أنا بخير.' }, next: 'end' },
        ],
      },
      heal: {
        speaker: { en: 'Amal the Healer', ar: 'المعالجة أمل' },
        text: { en: 'There. The body remembers being whole.', ar: 'ها أنت. الجسد يتذكّر أنه كان مكتملًا.' },
        next: 'end',
      },
      song: {
        speaker: { en: 'Amal the Healer', ar: 'المعالجة أمل' },
        text: {
          en: 'The aether remembers the stars. Some nights, if you are still, you can hear it hum back.',
          ar: 'الأثير يتذكّر النجوم. في بعض الليالي، إن سكنت، تستطيع أن تسمعه يردّ الدندنة.',
        },
        next: 'end',
      },
      end: {
        speaker: { en: 'Amal the Healer', ar: 'المعالجة أمل' },
        text: { en: 'Drink water. Real water.', ar: 'اشرب الماء. ماءً حقيقيًا.' },
        next: 'end',
      },
    },
  },

  // -------------------------------------------------------------- guard Tariq
  'dlg-guard-01': {
    id: 'dlg-guard-01',
    nodes: {
      start: {
        speaker: { en: 'Guard Tariq', ar: 'الحارس طارق' },
        text: {
          en: 'Halt — oh. You\'re not a scorpion. Sorry, reflex.',
          ar: 'قف — آه. أنت لست عقربًا. آسف، رد فعل.',
        },
        choices: [
          {
            text: { en: 'What are you guarding?', ar: 'ماذا تحرس؟' },
            next: 'guarding',
          },
          {
            text: { en: 'Need help?', ar: 'هل تحتاج مساعدة؟' },
            next: 'help',
            condition: { notFlag: 'q_jackal_offered' },
          },
          { text: { en: 'Carry on.', ar: 'واصل.' }, next: 'end' },
        ],
      },
      guarding: {
        speaker: { en: 'Guard Tariq', ar: 'الحارس طارق' },
        text: {
          en: 'The path to the oasis. Also my dignity. Both under constant threat.',
          ar: 'الطريق إلى الواحة. وكريمتي أيضًا. كلاهما تحت تهديد مستمر.',
        },
        next: 'end',
      },
      help: {
        speaker: { en: 'Guard Tariq', ar: 'الحارس طارق' },
        text: {
          en: 'The jackals are getting bold. Eight of them — then I can stand like a proper guard again.',
          ar: 'الذئاب تصبح جريئة. ثمانية منها — ثم أستطيع الوقوف كحارس محترم مرة أخرى.',
        },
        choices: [
          {
            text: { en: 'Consider it done.', ar: 'اعتبر الأمر منتهيًا.' },
            next: 'end',
            setFlags: ['q_jackal_offered'],
            effects: [{ type: 'startQuest', questId: 'q-jackal-hunt' }],
          },
          { text: { en: 'No thanks.', ar: 'لا شكرًا.' }, next: 'end' },
        ],
      },
      end: {
        speaker: { en: 'Guard Tariq', ar: 'الحارس طارق' },
        text: { en: 'The oasis is lovely this time of never.', ar: 'الواحة رائعة في هذا الوقت من الأبد.' },
        next: 'end',
      },
    },
  },

  // -------------------------------------------------------- wanderer Najma
  'dlg-wanderer-01': {
    id: 'dlg-wanderer-01',
    nodes: {
      start: {
        speaker: { en: 'Najma the Wanderer', ar: 'الرحّالة نجمة' },
        text: {
          en: 'You walk like someone carrying a memory that isn\'t yours.',
          ar: 'تمشي كمن يحمل ذكرى ليست لك.',
        },
        choices: [
          {
            text: { en: 'How can you tell?', ar: 'كيف يمكنك معرفة ذلك؟' },
            next: 'tell',
          },
          {
            text: { en: 'Any secrets to share?', ar: 'هل لديك أسرار للمشاركة؟' },
            next: 'secret',
            condition: { minLevel: 3 },
          },
          { text: { en: 'Safe travels.', ar: 'رحلات آمنة.' }, next: 'end' },
        ],
      },
      tell: {
        speaker: { en: 'Najma the Wanderer', ar: 'الرحّالة نجمة' },
        text: {
          en: 'The sand tells on everyone. Yours hums the well\'s old song.',
          ar: 'الرمل يخبر عن الجميع. رملك يهمس بأغنية البئر القديمة.',
        },
        next: 'end',
      },
      secret: {
        speaker: { en: 'Najma the Wanderer', ar: 'الرحّالة نجمة' },
        text: {
          en: 'Behind every third dune, dig where the shadow points at noon. The desert rewards the curious.',
          ar: 'خلف كل ثالث كثيب، احفور حيث تشير الظل عند الظهر. الصحراء تكافئ الفضوليين.',
        },
        next: 'end',
        effects: [{ type: 'giveGold', amount: 25 }],
      },
      end: {
        speaker: { en: 'Najma the Wanderer', ar: 'الرحّالة نجمة' },
        text: { en: 'May your bottle stay half full.', ar: 'لتبقَ قارورتك نصف ممتلئة.' },
        next: 'end',
      },
    },
  },

  // ---------------------------------------------------------- story beats
  'dlg-intro-vision': {
    id: 'dlg-intro-vision',
    nodes: {
      start: {
        speaker: { en: '???', ar: '؟؟؟' },
        text: {
          en: '...the well cracks... the stars pour down... find the shards... before the storm remembers everything...',
          ar: '...البئر تتصدّع... النجوم تنهمر... أعثر على الشظايا... قبل أن تتذكّر العاصفة كل شيء...',
        },
        choices: [
          {
            text: { en: 'Who are you?', ar: 'من أنت؟' },
            next: 'who',
          },
          {
            text: { en: '[Wake up]', ar: '[استيقظ]' },
            next: 'wake',
            effects: [{ type: 'setFlag', flag: 'intro_seen' }, { type: 'playSound', sound: 'portal' }],
          },
        ],
      },
      who: {
        speaker: { en: '???', ar: '؟؟؟' },
        text: {
          en: '...I am what the sand kept... hurry...',
          ar: '...أنا ما احتفظ به الرمل... أسرع...',
        },
        next: 'wake',
      },
      wake: {
        speaker: { en: '', ar: '' },
        text: {
          en: 'You wake at the edge of the singing dunes.',
          ar: 'تستيقظ على حافة الكثبان الغنّاء.',
        },
        next: 'end',
        setFlags: ['intro_seen'],
      },
    },
  },
  'dlg-boss-warning': {
    id: 'dlg-boss-warning',
    nodes: {
      start: {
        speaker: { en: 'The Bottle', ar: 'القارورة' },
        text: {
          en: 'The glass hums louder. Something vast sleeps ahead.',
          ar: 'الزجاج يهتزّ بصوت أعلى. شيء هائل ينام في المقدمة.',
        },
        choices: [
          {
            text: { en: '[Steel yourself]', ar: '[استعدّ]' },
            next: 'end',
            effects: [{ type: 'setFlag', flag: 'boss_warned' }, { type: 'playSound', sound: 'boss' }],
          },
        ],
      },
      end: {
        speaker: { en: '', ar: '' },
        text: { en: 'The storm holds its breath.', ar: 'العاصفة تحبس أنفاسها.' },
        next: 'end',
      },
    },
  },
  'dlg-memory-shard': {
    id: 'dlg-memory-shard',
    nodes: {
      start: {
        speaker: { en: 'Memory Shard', ar: 'شظية الذكرى' },
        text: {
          en: 'You see: an ocean of stars, dunes of light, and a hand letting go.',
          ar: 'ترى: محيطًا من النجوم، كثبانًا من ضوء، ويدًا تفلت.',
        },
        choices: [
          {
            text: { en: '[Hold the memory]', ar: '[احتفظ بالذكرى]' },
            next: 'end',
            effects: [
              { type: 'giveXP', amount: 120 },
              { type: 'setFlag', flag: 'shard_seen' },
            ],
          },
        ],
      },
      end: {
        speaker: { en: '', ar: '' },
        text: { en: 'The bottle warms against your side.', ar: 'القارورة تدفأ على جنبك.' },
        next: 'end',
      },
    },
  },
};

export function getDialogue(id) {
  return DIALOGUES[id] ?? null;
}

export default DIALOGUES;
