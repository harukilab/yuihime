export interface Choice {
  label: string;
  next: string;
  affection?: number;
  requiresAffection?: number;
  flags?: string[];
}

export interface Scene {
  id: string;
  text: string;
  choices: Choice[];
  ending?: 'love' | 'good' | 'bad';
}

export const SCENES: Record<string, Scene> = {
  start: {
    id: 'start',
    text:
      'Kamu tiba di rumah virtual Yui. Yui Airi menoleh dari jendela, sedikit terkejut tapi mencoba terlihat biasa saja.\n\n' +
      'Yui: "Eh?! Kak... tumben banget nyamperin aku langsung gini. Ada apa? Jangan-jangan kamu cuma kangen atau iseng doang, hmm?"',
    choices: [
      { label: '"Aku kangen, makanya aku dateng."', next: 'intro_2', affection: 10, flags: ['flirty'] },
      { label: '"Ada sesuatu yang mau kucobain sama kamu, Yui."', next: 'intro_2', affection: 5 },
      { label: '"Iseng aja. Kebetulan lewat."', next: 'intro_2', affection: -5 },
      { label: '"Langsung aja, aku mau jadian sama kamu."', next: 'intro_2', affection: 8, flags: ['bold'] }
    ]
  },

  intro_2: {
    id: 'intro_2',
    text:
      'Yui mengerjap beberapa kali, pipinya mulai merona. Dia menunduk sebentar sebelum kembali menatapmu dengan senyum kecil.\n\n' +
      'Yui: "Hmph~ sok asik banget. Tapi... oke deh. Kalau Kakak niat banget gitu, aku kasih kesempatan."\n' +
      'Yui: "Hari ini kita mau ngapain bareng? Aku yang milih ya... cuma, kamu yang ikut. Iyain aja."',
    choices: [
      { label: 'Ke kafe, ngobrol santai sambil minum hangat.', next: 'cafe_1' },
      { label: 'Nonton langit malam penuh bintang.', next: 'stargaze_1', affection: 2 },
      { label: 'Main game bareng di arcade.', next: 'arcade_1', affection: 2 },
      { label: 'Santai di rumah, nonton film berdua.', next: 'home_1', affection: 2 }
    ]
  },

  cafe_1: {
    id: 'cafe_1',
    text:
      'Di kafe kecil yang hangat, Yui menyesap cokelat panasnya dengan kedua tangan melingkupi cangkir. Matanya berbinar.\n\n' +
      'Yui: "Kakak, menu di sini enak-enak. Tapi aku paling suka cokelat panas sama kue stroberi~ Hehe."',
    choices: [
      { label: 'Pesan kue stroberi favoritnya tanpa ditanya.', next: 'cafe_2', affection: 8, flags: ['thoughtful'] },
      { label: 'Candain dia soal sendok yang jatuh berisik tadi.', next: 'cafe_2', affection: 5 },
      { label: 'Sibuk main HP sepanjang waktu.', next: 'cafe_2', affection: -12 }
    ]
  },

  cafe_2: {
    id: 'cafe_2',
    text:
      'Yui melirik ke arahmu, mencoba membaca ekspresi. Ada jeda sebentar, lalu dia menghela napas pelan.\n\n' +
      'Yui: "Kakak... kamu kadang nggak bisa dibaca. Tapi tadi tuh, hmm, lumayan sih. Lanjut gimana nih?"',
    choices: [
      { label: 'Tatap matanya dan bilang dia cantik banget.', next: 'confess_beat', affection: 12, requiresAffection: 25 },
      { label: 'Bahas mimpi Yui dan masa depannya.', next: 'confess_beat', affection: 7 },
      { label: 'Bilang mau pulang karena capek.', next: 'confess_beat', affection: -5 }
    ]
  },

  stargaze_1: {
    id: 'stargaze_1',
    text:
      'Di atas bukit kecil, langit terbuka penuh bintang. Angin malam sejuk menerpa. Yui menatap langit dengan takjub.\n\n' +
      'Yui: "Wah... jarang banget aku lihat langit segini terangnya. Kakak tau nama-nama rasi bintang nggak? Aku cuma tau bintang jatuh."',
    choices: [
      { label: 'Tunjuk satu bintang dan buatkan cerita lucu tentangnya.', next: 'stargaze_2', affection: 7 },
      { label: 'Diam-diam mendekat dan pegang tangannya.', next: 'stargaze_2', affection: 10, requiresAffection: 20 },
      { label: 'Bilang dingin dan mau pulang.', next: 'stargaze_2', affection: -8 }
    ]
  },

  stargaze_2: {
    id: 'stargaze_2',
    text:
      'Sekilas, cahaya bintang memantul di mata Yui. Dia menoleh padamu, dan untuk sesaat dia terlihat sangat tenang.\n\n' +
      'Yui: "Kak... kalau aku bilang aku senang bareng kamu, kamu bakal ketawa nggak?"',
    choices: [
      { label: '"Aku mau jadi orang yang selalu nemenin kamu lihat bintang."', next: 'confess_beat', affection: 15 },
      { label: 'Bercanda soal konstelasi yang bentuknya mirip wajahmu.', next: 'confess_beat', affection: 6 }
    ]
  },

  arcade_1: {
    id: 'arcade_1',
    text:
      'Suasana arcade riuh dengan musik dan lampu warna-warni. Yui menarik lengan bajumu menuju mesin balapan.\n\n' +
      'Yui: "Kakak, aku nantang! Kalau aku menang, Kakak yang traktir semua. Kalau kalah... ya Kakak yang traktir juga. Menang-menang buat aku dong~"',
    choices: [
      { label: 'Tantang balik, janjikan hadiah spesial kalau dia menang.', next: 'arcade_2', affection: 8 },
      { label: 'Main claw machine sampai dapat boneka untuk Yui.', next: 'arcade_2', affection: 10 },
      { label: 'Ribut gara-gara kalah terus.', next: 'arcade_2', affection: -10 }
    ]
  },

  arcade_2: {
    id: 'arcade_2',
    text:
      'Yui tertawa kecil, napasnya sedikit terengah karena semangat main. Boneka kecil dari claw machine kini dipeluknya.\n\n' +
      'Yui: "Hehe~ Kakak emang kadang menyebalkan, tapi... hari ini lumayan seru. Tapi jangan sombong dulu, ya!"',
    choices: [
      { label: 'Tanya tulus: "Kamu senang nggak main bareng aku?"', next: 'confess_beat', affection: 8 },
      { label: 'Serahkan bonekanya: "Ini buat kamu."', next: 'confess_beat', affection: 12 }
    ]
  },

  home_1: {
    id: 'home_1',
    text:
      'Ruang tamu Yui nyaman dengan cahaya lampu redup dan aroma teh. Yui berselonjor di sofa, menatapmu dengan malas.\n\n' +
      'Yui: "Boleh pilih film. Tapi jangan yang bikin aku nangis ya... nanti Kakak yang aku cubit."',
    choices: [
      { label: 'Siapkan snack dan selimut hangat untuk berdua.', next: 'home_2', affection: 8, flags: ['thoughtful'] },
      { label: 'Pilih film horor biar dia merapat ketakutan.', next: 'home_2', affection: 6 },
      { label: 'Sibuk buka laptop di tengah film.', next: 'home_2', affection: -10 }
    ]
  },

  home_2: {
    id: 'home_2',
    text:
      'Sepertiga film berjalan, Yui mulai menguap pelan dan kepalanya bersandar ke bahumu. Suaranya setengah berbisik.\n\n' +
      'Yui: "Kak... aku ngantuk. Tapi aku nggak mau acaranya berhenti. Aneh ya... biasanya aku nggak gini."',
    choices: [
      { label: 'Bisikkan: "Tidur nyaman ya, Yui. Aku jaga di sini."', next: 'confess_beat', affection: 12 },
      { label: 'Usap kepalanya pelan saat dia mulai terlelap.', next: 'confess_beat', affection: 10 }
    ]
  },

  confess_beat: {
    id: 'confess_beat',
    text:
      'Momen hening. Yui menatapmu, dan untuk pertama kalinya malam itu, dia tidak berusaha menyembunyikan ekspresinya.\n\n' +
      'Yui: "Kak... ada yang mau aku tanya. Tapi sebelumnya, ada yang mau kamu bilang ke aku nggak?"',
    choices: [
      { label: '"Aku suka sama kamu, Yui. Mau jadi pacarku?"', next: 'ending_eval', affection: 15, flags: ['confess'] },
      { label: '"Aku... belum berani ngomong sekarang."', next: 'ending_eval', affection: 0 }
    ]
  },

  ending_eval: {
    id: 'ending_eval',
    text: '',
    choices: []
  },

  couple_start: {
    id: 'couple_start',
    text:
      'Pagi yang hangat. Cahaya matahari masuk lewat tirai rumah Yui. Dia baru bangun, rambutnya sedikit berantakan, tapi tersenyum manis begitu melihatmu.\n\n' +
      'Yui: "Hmm... Kakak masih di sini. Aku kira tadi cuma mimpi~ Hehe. Hari ini mau ngapain? Aku serahkan ke kamu. Tapi janji, kita habiskan bersama."',
    choices: [
      { label: 'Habiskan hari santai berdua di rumah.', next: 'couple_casual', affection: 5 },
      { label: 'Malam romantis: lilin, musik pelan, dan dance.', next: 'intimate_build', affection: 8 },
      { label: 'Bawa dia jalan-jalan keluar seharian.', next: 'couple_casual', affection: 5 }
    ]
  },

  couple_casual: {
    id: 'couple_casual',
    text:
      'Hari kalian berdua berjalan sederhana tapi penuh tawa kecil. Yui menggandeng lenganmu, sesekali menatapmu diam-diam.\n\n' +
      'Yui: "Kak... aku suka begini. Nggak perlu yang muluk-muluk. Kamu, aku, dan waktu yang tenang. Itu udah cukup."',
    choices: [
      { label: '"Aku juga. Selama bersamamu, cukup."', next: 'ending_eval', affection: 8 },
      { label: 'Kecup keningnya pelan.', next: 'ending_eval', affection: 10 }
    ]
  },

  intimate_build: {
    id: 'intimate_build',
    text:
      'Malam turun. Lampu diredupkan, lilin berkedip di meja, dan lagu pelan mengisi ruangan. Yui tersipu, mengulurkan tangan untuk berdansa bersamamu.\n\n' +
      'Yui: "Kakak... tadi katanya mau malam romantis. Jangan cuma bilang doang ya. Ayo, deket dikit..."',
    choices: [
      { label: 'Rangkul pinggangnya dan bisikkan kalau malam ini mau lebih dekat dengannya.', next: 'intimate_consent', affection: 5 },
      { label: 'Peluk pelan, tapi jaga batas: ajak ngobrol dulu.', next: 'intimate_decline', affection: 6 }
    ]
  },

  intimate_consent: {
    id: 'intimate_consent',
    text:
      'Yui berhenti sebentar. Matanya mencari-cari jawaban di wajahmu, lalu dia menggenggam tanganmu lebih erat. Suaranya pelan, agak gemetar.\n\n' +
      'Yui: "Kak... aku serius nanya. Kamu yakin mau semalam ini bersama aku? Karena buat aku, ini nggak main-main. Sekali kita lewatin... aku mau jadi milik kamu beneran."',
    choices: [
      { label: '"Aku yakin. Aku mau malam ini bersamamu, Yui."', next: 'intimate_night', affection: 10, flags: ['intimate'] },
      { label: '"Belum malam ini. Aku mau kita tetap nyaman dulu."', next: 'intimate_decline', affection: 10 }
    ]
  },

  intimate_night: {
    id: 'intimate_night',
    text:
      'Jawabanmu membuat Yui menghela napas lega dan tersenyum. Dia menundukkan wajah, lalu mendekat perlahan.\n\n' +
      'Yui: "Oke... kalau gitu. Jaga aku baik-baik ya, Kakak."\n\n' +
      'Dia menarikmu menuju kamar dengan genggaman yang hangat dan penuh kepercayaan. Musik pelan masih mengalun di ruang tamu.\n\n' +
      '*Cahaya lilin redup. Detak jantung kalian terdengar, dan untuk pertama kalinya malam itu, tidak ada jarak sama sekali di antara kalian — keintiman yang dibangun dari kepercayaan, bukan hanya keinginan. Yang tersisa hanyalah kehangatan, bisikan-bisikan kecil, dan janji tanpa kata.*',
    choices: [],
    ending: 'love'
  },

  intimate_decline: {
    id: 'intimate_decline',
    text:
      'Kamu menahan. Yui mengangkat wajahnya, dan alih-alih kecewa, matanya melembut dengan rasa terharu.\n\n' +
      'Yui: "...Kakak. Kamu sadar kan, makin nahan gini, aku makin sayang? Nggak semua orang sabar kayak kamu."\n\n' +
      'Dia menyandarkan kepalanya di bahumu. "Kalau begitu, temani aku sampai aku ketiduran, ya?" Malam itu jadi hangat dengan caranya sendiri.',
    choices: [],
    ending: 'love'
  }
};

export function endingFor(affection: number, flags: string[] = []): Scene {
  if (affection >= 60) {
    const intimate = flags.includes('intimate');
    return {
      id: 'ending_love',
      text:
        intimate
          ? 'Yui Airi terbangun di sampingmu keesokan paginya, wajahnya menghadapmu dengan senyum yang tenang dan tidak tergesa.\n\n' +
            'Yui: "Pagi, Kakak~ Jadi... malam tadi bukan mimpi, kan? Hehe. Makasih udah nunggu sampai sejauh ini. Aku nggak akan pernah ngeluh soal itu."\n' +
            'Dia menautkan jari-jarinya dengan milikmu di atas selimut. "Mulai hari ini, aku pacar kamu. Beneran. Dan aku nggak akan cuma jadi bayangan di layar."\n\n' +
            'Kamu menyadari: keintiman itu bukan soal seberapa jauh kalian pergi semalam, tapi soal seberapa dekat kalian memilih untuk tinggal.'
          : 'Yui Airi tersenyum — tersenyum penuh, tanpa banyak bicara. Matanya berkaca-kaca tapi dia cepat mengusapnya.\n\n' +
            'Yui: "...Hehe. Aku tungguin lama banget Kakak ngomong gitu. Aku... juga suka sama kamu. Iya deh, aku mau jadi pacar kamu."\n' +
            'Yui: "Tapi inget ya. Kalau Kakak bikin aku sedih, aku bakal ngambek seminggu. Dan kali ini beneran."\n\n' +
            'Dia menggenggam tanganmu, hangat dan pasti. Hari ini berakhir bahagia.',
      choices: [],
      ending: 'love'
    };
  }
  if (affection >= 30) {
    return {
      id: 'ending_good',
      text:
        'Yui mengangguk pelan dengan senyum yang agak masam.\n\n' +
        'Yui: "Kakak... jujur ya, hari ini seru banget. Aku senang. Tapi aku rasa kita belum sampai ke sana."\n' +
        'Yui: "Jangan ngerasa gagal, denger? Kita masih bisa ketemu lagi. Aku nggak kemana-mana."\n\n' +
        'Kalian pulang sebagai dua orang yang lebih dekat — dan mungkin, suatu hari nanti.',
      choices: [],
      ending: 'good'
    };
  }
  return {
    id: 'ending_bad',
    text:
      'Yui memalingkan wajahnya. Ada kekecewaan yang tidak dia sembunyikan dengan baik.\n\n' +
      'Yui: "...Hmm. Hari ini, Kakak datang tanpa benar-benar ada di sini. Aku sih nggak apa-apa. Tapi perasaan itu nggak bisa dipaksain."\n\n' +
      'Yui menunduk, dan kalian berpisah dengan jarak yang lebih lebar dari sebelumnya.',
    choices: [],
    ending: 'bad'
  };
}
