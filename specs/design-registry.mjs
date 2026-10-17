import { Penelope } from '@freesewing/penelope';
import { Titan } from '@freesewing/titan';
import { Teagan } from '@freesewing/teagan';
import { Simon } from '@freesewing/simon';
import { Sophie } from '@freesewing/sophie';
import { Carlita } from '@freesewing/carlita';

// Only these explicitly reviewed constructors may be selected by an input spec.
export const designs = Object.freeze({ penelope: Penelope, titan: Titan, teagan: Teagan,
  simon: Simon, sophie: Sophie, carlita: Carlita });
