// CRABDEN - what actually happened here.
//
// The short version: this was a shallow sea. It did not dry up because of a
// catastrophe. It dried up because of a crab, and then it stayed dry because
// the crab went to sleep. Everything the people built here was built on that
// misunderstanding, and everything alive here now is what could live with it.
//
// These are found, not given: fragments come off ruins, Vess writes the rest.

export const ERAS = [
  {
    id: 'sea', name: 'The Shallow Sea', when: 'before',
    text: 'A warm shelf sea, nowhere more than forty metres deep, sitting on a '
      + 'basin of porous rock. Reef along the eastern arm, salt marsh at the '
      + 'southern end. It had been like that for a very long time.',
  },
  {
    id: 'spring', name: 'The Spring', when: 'before',
    text: 'The basin did not fill from rivers. It filled from below, through a '
      + 'single artesian system, and that system ran through the body of one '
      + 'very large and very old animal that had settled on top of it. Nobody '
      + 'knew that. There was no reason anyone would.',
  },
  {
    id: 'towns', name: 'The Shore Towns', when: 'before',
    text: 'Eleven settlements around the rim, all of them fishing, all of them '
      + 'building their cisterns facing the water. The stone they used is the '
      + 'same stone still standing out there in rows.',
  },
  {
    id: 'sleep', name: 'The Sleep', when: 'the turn',
    text: 'The animal went dormant. Not dramatically - it simply stopped, the '
      + 'way a spring stops. The sea took eighty years to go. Long enough that '
      + 'nobody living ever saw it as a single event, and everyone blamed the '
      + 'weather.',
  },
  {
    id: 'leaving', name: 'The Leaving', when: 'after',
    text: 'The towns moved twice, then stopped moving. The last cistern was cut '
      + 'into rock four hundred metres below the old shoreline, and it was dry '
      + 'inside a decade. Whoever cut it left the tools in it.',
  },
  {
    id: 'answer', name: 'What Answered', when: 'after',
    text: 'A drying world does not empty. It selects. Reptiles and arthropods '
      + 'already carried the two things that mattered - a waterproof skin and a '
      + 'way of excreting waste without spending water on it. Almost everything '
      + 'out here now is one or the other. The four furred survivors are small, '
      + 'nocturnal, and never drink.',
  },
  {
    id: 'survey', name: 'The Survey', when: 'now',
    text: 'Eleven years of it, by one archaeologist, on a grant that expired in '
      + 'the fourth year. Nineteen basins mapped, four thousand and six field '
      + 'days logged, and one entry that reads simply: THE ROCK MOVED.',
  },
];

/** Fragments read off ruins. One per visit, in order. */
export const INSCRIPTIONS = [
  'Carved on a cistern lip: "FILLED THIS YEAR TO THE THIRD MARK." The third mark is two metres above the sand.',
  'A boundary stone. One face lists a family. The other face lists what they were owed in fish.',
  'A step worn concave by feet. It faces a harbour that is now nine kilometres of dune.',
  'Scratched later, in a different hand: "THE WELL IS NOT LOWER. THE SEA IS."',
  'A child\'s handprint pressed into the render before it set. Small, and in no hurry.',
  'A tide table, cut properly, in a good hand. It stops mid-year.',
  'A door lintel with the hinges still in it. The door is somewhere under all this.',
  'Someone has counted something in fives, four hundred times, and then stopped.',
  'A list of names with a line through each. The last one has no line.',
  'Cut deep, and last: "WE WAITED."',
];

/** Vess, on what she is looking at, unlocked as you find things. */
export const VESS_LORE = [
  { need: 0, line: 'Eleven years I mapped this basin. You made it in an afternoon. I am fine.' },
  { need: 1, line: 'Every ruin out here was built by people who thought the water would come back.' },
  { need: 2, line: 'They cut their cisterns facing the shore. All eleven towns. That is not superstition, that is a survey.' },
  { need: 3, line: 'The stone is all one quarry. Whoever they were, they were organised right up until they were not.' },
  { need: 4, line: 'I keep finding tide tables. Beautiful work. Every one of them stops the same decade.' },
  { need: 6, line: 'There is a version of this where the sea stopped because of weather. I have stopped believing it.' },
  { need: 8, line: 'The aquifer runs under all of this and comes up in exactly one place. I am standing next to the place.' },
  { need: 10, line: 'You did this. Not maliciously. You went to sleep, and a sea went with you.' },
  { need: 13, line: 'I am not going to publish that. Nobody would believe the mechanism, and you would become a resource.' },
  { need: 16, line: 'So I am going to keep walking next to you and writing it all down, and we will see how far the green gets.' },
];

/** Short in-world descriptions for the field-note world section. */
export const WORLD_NOTES = [
  ['The basin', 'Forty thousand strides end to end, seven kinds of ground, and one aquifer under all of it.'],
  ['The salt pan', 'The deepest part of the old sea, and the flattest thing you will ever walk across. It weeps in the morning: that is brine, not dew.'],
  ['The bone reef', 'A coral reef that died standing up and never fell over. The white ridges are all skeleton.'],
  ['The sleeping dunes', 'Live sand. It moves about a metre a year, and it is moving over the towns.'],
  ['The glass flats', 'A thousand years of dry lightning on silica sand. It is exactly what it looks like.'],
  ['The rustlands', 'Where the machines were. The desert has been chewing on them and has nearly finished.'],
  ['The ashwood', 'The only place ironwood still stands in numbers. It is not a forest. It is the last stand of one.'],
  ['The deep well', 'The bottom of the aquifer, and the far end of everything. Something is still down there.'],
];
