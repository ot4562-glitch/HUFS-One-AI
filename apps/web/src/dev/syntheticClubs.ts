import type {DemoContext} from '@hufs-one/contracts';
import {DEMO_AS_OF, DEMO_CLUB_POSTS, DEMO_STUDENTS, composeClubBoard, demoClubProfile} from '../../../../packages/core/src/opportunities/index.js';
import type {ClubPort} from '../features/clubs/useClubBoard.js';

/**
 * Dev/test-only #123 club board: runs the merged pure club core for the context's synthetic subject at the
 * demo asOf. Stands in for a club API that does not exist yet. Never reached from a production build.
 */
export function syntheticClubPort(options: {delayMs?: number} = {}): ClubPort {
  return {
    loadBoard: async (ctx: DemoContext, signal: AbortSignal) => {
      if (options.delayMs) await new Promise(r => setTimeout(r, options.delayMs));
      if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
      const student = DEMO_STUDENTS.find(s => s.subject === ctx.demoSubjectId);
      if (!student) throw new RangeError('unknown synthetic subject');
      return composeClubBoard(demoClubProfile(student), DEMO_CLUB_POSTS, {asOf: DEMO_AS_OF});
    },
  };
}
