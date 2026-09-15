/* 64Griddle local analysis engine. No network, persistence, or third-party code. */
(function (root) {
  'use strict';
  const AGENTS = {
    auto: { name: 'Auto-detect', coding: false },
    general: { name: 'General agent', coding: false },
    chatgpt: { name: 'ChatGPT', coding: false },
    claude: { name: 'Claude', coding: false },
    gemini: { name: 'Gemini', coding: false },
    perplexity: { name: 'Perplexity', coding: false },
    codex: { name: 'Codex', coding: true },
    cursor: { name: 'Cursor', coding: true },
    builder: { name: 'Browser builder', coding: true },
  };
  const GOALS = {
    balanced: {
      name: 'Balanced',
      description: 'Check the outcome, context, scope, and requested output.',
    },
    depth: {
      name: 'Be thorough',
      description: 'Clarify scope and how the result will be checked.',
    },
    fast: {
      name: 'Get a first result',
      description: 'Define a useful first deliverable and a stopping point.',
    },
    tokens: {
      name: 'Keep it concise',
      description: 'Remove expendable wording. Keep the requirements that matter.',
    },
  };
  const TASKS = {
    auto: { name: 'Detect from prompt' },
    coding: { name: 'Build or change software' },
    debugging: { name: 'Fix a software problem' },
    research: { name: 'Research or compare' },
    writing: { name: 'Write or edit' },
    summarizing: { name: 'Summarize material' },
    analysis: { name: 'Analyze data' },
    general: { name: 'General task' },
  };
  // Sources support these principles, not the accuracy of our detection rules.
  // Wording, triggers, and applicability are maintained and tested by 64ARCS.
  const SOURCES = {
    context: {
      publisher: 'OpenAI',
      title: 'Prompt engineering · relevant context',
      url: 'https://developers.openai.com/api/docs/guides/prompt-engineering#include-relevant-context-information',
      principle:
        'Provide the information needed for the task and distinguish instructions from reference material.',
    },
    clarity: {
      publisher: 'Google',
      title: 'Prompt design · clear instructions',
      url: 'https://ai.google.dev/gemini-api/docs/prompting-strategies#clear-and-specific-instructions',
      principle: 'Make the task, constraints, and desired response explicit.',
    },
    success: {
      publisher: 'Anthropic',
      title: 'Define success and build evaluations',
      url: 'https://platform.claude.com/docs/en/test-and-evaluate/develop-tests',
      principle: 'Define observable success criteria and evaluate on representative tasks.',
    },
    workflow: {
      publisher: 'Anthropic',
      title: 'Prompting best practices · coding and scope',
      url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices',
      principle:
        'State the intended scope and inspect relevant project files before making claims about code.',
    },
  };
  const REVIEWED_ON = '2026-09-08';
  function basisFor(s) {
    if (s.id === 'filler' || s.id.startsWith('repeat-'))
      return {
        type: 'Text check',
        source: null,
        principle:
          'An optional wording edit based on the exact text shown. No model-performance claim.',
      };
    const source =
      s.id === 'agent-project'
        ? 'workflow'
        : ['outcome', 'verification'].includes(s.id)
          ? 'success'
          : /context|audience|facts|material|failure|data|evidence|freshness/.test(s.id)
            ? 'context'
            : 'clarity';
    return {
      type: s.category === 'Consistency' ? 'Possible conflict' : 'Task-specific check',
      source,
      principle: SOURCES[source].principle,
    };
  }
  function profileNote(agent) {
    if (agent === 'auto')
      return 'Auto-detect selects a profile from the current site. Chat sites use shared general checks; browser builders use shared coding-workflow checks. Unknown sites use general checks.';
    return AGENTS[agent]?.coding
      ? 'Coding workflow: can suggest inspecting an existing project first. Codex, Cursor, and Browser builder share these checks.'
      : 'General workflow: ChatGPT, Claude, Gemini, and Perplexity share the same local checks. Selecting a name does not connect to or optimize a model.';
  }
  function detectAgent(host = '') {
    host = host.toLowerCase();
    if (/(^|\.)chatgpt\.com$/.test(host)) return 'chatgpt';
    if (/(^|\.)claude\.ai$/.test(host)) return 'claude';
    if (host === 'gemini.google.com') return 'gemini';
    if (/(^|\.)perplexity\.ai$/.test(host)) return 'perplexity';
    if (/(^|\.)(bolt\.new|lovable\.dev|replit\.com)$/.test(host)) return 'builder';
    return 'general';
  }
  function taskType(text) {
    // A prohibited action must not select the workflow. Keep the original text
    // for constraint checks; mask only simple negative clauses for task routing.
    text = text.replace(
      /\b(?:do not|don't|never)\s+(?:build|implement|refactor|code|develop|create|make|design|write|draft|rewrite|summari[sz]e|analy[sz]e|compare|research)\b[^.!?;\n,]*?(?=\b(?:but|instead)\b|[.!?;\n,]|$)/gi,
      (clause) => ' '.repeat(clause.length),
    );
    // "the article editor component" names software; "an email to my team" names something to write.
    const writingNounModifies =
      /\b(?:email|message|article|essay|post|story|copy|letter)s?\s+(?:\w+\s+){0,2}?(?:editor|component|page|screen|endpoint|api|button|form|field|template|module|class|function|service|handler|controller|model|schema|table|widget|view|feature|flow|pipeline)\b/i.test(
        text,
      );
    if (
      !writingNounModifies &&
      /\b(?:write|draft|rewrite|compose|edit)\b.{0,45}\b(?:email|message|article|essay|post|story|copy|letter)\b/i.test(
        text,
      )
    )
      return 'writing';
    if (
      /\b(?:write|create|generate|optimi[sz]e)\b.{0,45}\b(?:sql|postgresql|mysql|sqlite)\b.{0,25}\bquery\b|\b(?:write|create|generate|optimi[sz]e)\b.{0,25}\bquery\b.{0,25}\b(?:sql|postgresql|mysql|sqlite)\b/i.test(
        text,
      )
    )
      return 'coding';
    if (/\b(?:summari[sz]e|summari[sz]ation|write a summary|tl;?dr)\b/i.test(text))
      return 'summarizing';
    if (
      /\b(?:debug|fix|diagnose|troubleshoot)\b.{0,80}\b(?:bug|error|crash|code|function|app|api|login|test|page|script|component|form|issue)\b|\b(?:TypeError|ReferenceError|stack trace)\b/i.test(
        text,
      )
    )
      return 'debugging';
    // People usually report the symptom before asking for help: "my app is broken, please fix".
    // Require a software subject, a symptom and a request for help, so ordinary prose is unaffected.
    if (
      /\b(?:app|application|website|site|page|code|script|function|method|component|api|endpoint|server|build|tests?|login|form|button|query|database|db|extension|bot|deploy\w*|container|docker|pipeline)\b/i.test(
        text,
      ) &&
      /\b(?:broken|not working|doesn'?t work|isn'?t working|won'?t work|crash(?:es|ing|ed)?|fail(?:s|ing|ed|ure)?|throwing|erroring|stuck|hanging|returns? (?:nothing|null|undefined|nan)|500|404)\b/i.test(
        text,
      ) &&
      /\b(?:fix|debug|diagnose|troubleshoot|help|solve|why)\b/i.test(text)
    )
      return 'debugging';
    if (
      /\b(?:analy[sz]e|explore|calculate|visuali[sz]e)\b.{0,80}\b(?:data|dataset|csv|tsv|spreadsheet|sheet|table|database|sales|revenue|metrics|survey|logs?|numbers?|figures?|records?|readings?|measurements?|responses?|scores?|results?|transactions?|expenses?|budget|traffic|usage|inventory|attendance|grades?|statistics|stats)\b/i.test(
        text,
      ) ||
      /\b(?:analy[sz]e|explore|calculate|visuali[sz]e)\b.{0,40}\b(?:attached|provided|uploaded|following)\b/i.test(
        text,
      )
    )
      return 'analysis';
    if (
      /\b(build|implement|refactor|code|develop|create|make|design|write)\b[\s\S]{0,100}\b(app|website|dashboard|api|function|bug|component|code|project|platform|script|extension|page|software|test|feature)\b/i.test(
        text,
      )
    )
      return 'coding';
    if (/\b(research|investigate|compare|analy[sz]e|evaluate|sources|citations)\b/i.test(text))
      return 'research';
    if (/\b(write|draft|rewrite|email|article|essay|post|copy|story)\b/i.test(text))
      return 'writing';
    return 'general';
  }
  // Masks quoted material and fenced code while preserving UTF-16 offsets.
  function instructionText(text) {
    return text.replace(
      /<(?:context|reference|source|document|example|user_input)\b[^>]*>[\s\S]*?<\/(?:context|reference|source|document|example|user_input)>|```[\s\S]*?(?:```|(?![\s\S]))|`[^`\n]+`|"[^"\n]*"|“[^”\n]*”|^\s*>[^\n]*/gm,
      (m) => m.replace(/[^\n]/g, ' '),
    );
  }
  // instructionText() blanks quoted and fenced material with spaces, so a pattern ending in \s+ can
  // run past the end of an instruction and into the user's own source material. An edit range is
  // therefore pulled back over any position the mask made blank but the draft did not.
  function withinDraft(masked, text, start, end) {
    for (let at = start; at < end; at++) if (masked[at] !== text[at]) return at;
    return end;
  }
  function analyze(text, config = {}) {
    text = typeof text === 'string' ? text : '';
    const agent = AGENTS[config.agent] ? config.agent : 'general';
    const goal = GOALS[config.goal] ? config.goal : 'balanced';
    const words = (text.trim().match(/\S+/g) || []).length;
    if (text.length > 30000)
      return {
        text,
        agent,
        goal,
        task: 'general',
        words,
        tokens: Math.ceil(text.length / 4),
        suggestions: [],
        checks: [],
        status: 'too-long',
      };
    const masked = instructionText(text);
    const task = config.task !== 'auto' && TASKS[config.task] ? config.task : taskType(masked);
    // Short continuations explicitly delegate details to an earlier agreement.
    // Do not infer that we have read it, or ask for its details all over again.
    const referencesPriorContext =
      words < 35 &&
      /\b(?:we agreed (?:on|earlier)|as (?:previously )?(?:agreed|discussed)|same (?:constraints|requirements|scope) as before|(?:previous|earlier) (?:plan|brief|requirements))\b/i.test(
        masked,
      );
    const complex =
      (task === 'coding' &&
        /\b(app|website|dashboard|platform|project|extension|feature|software)\b/i.test(masked)) ||
      ['debugging', 'research', 'analysis'].includes(task) ||
      (words >= 35 && task !== 'summarizing');
    const shortTask = !complex && words < 35;
    const software = task === 'coding' || task === 'debugging';
    const suggestions = [];
    const add = (x) => {
      if (
        referencesPriorContext &&
        (x.kind === 'append' || (x.kind === 'detail' && !Number.isInteger(x.start)))
      )
        return;
      x.key = x.id + ':' + (x.original || x.replacement || '');
      x.category = x.category || 'Direction';
      x.basis = basisFor(x);
      x.observation =
        x.observation ||
        (x.original
          ? `This draft contains “${x.original}”.`
          : `Consider this detail for “${TASKS[task].name}”. It may already be available in your conversation.`);
      x.reviewedOn = REVIEWED_ON;
      suggestions.push(x);
    };
    // Recognize a stated user action without requiring a formal "Users can" label.
    // Keep this narrow: "helps me" alone is not an observable result.
    const hasUserAction =
      /\b(?:helps?|lets?|allows?)\s+(?:me|us|you|users?|people)\s+(?:to\s+)?(?:set|schedule|track|choose|create|edit|delete|view|send|receive|search|export|import|upload|download|play|record|filter|sort)\s+\S+/i.test(
        masked,
      );
    const hasOutcome =
      hasUserAction ||
      /\b(so that|so users|allow\w* users|users can|must be able|success|acceptance|done when|deliverable|return|output|produce|translate|summari[sz]e|calculate|explain|answer|fix|debug|refactor)\b/i.test(
        masked,
      );
    const hasContext =
      /\b(existing|repository|repo|codebase|attached|provided|audience|users are|for (?:my |our |a |an |the )?(?:team|students|teachers|developers|customers|beginners)|react|next\.?js|python|typescript|javascript|source|dataset|background|context|requirements)\b/i.test(
        masked,
      );
    const hasFormat =
      /\b(return|output|deliver|format|table|json|csv|bullets?|markdown|diff|patch|summary|answer|words|sentences|paragraphs?)\b/i.test(
        masked,
      );
    const hasScope =
      /\b(only|limit|scope|first|mvp|exclude|out of scope|do not|don't|without|preserve|must not|focus)\b/i.test(
        masked,
      );
    const hasVerification =
      /\b(test|tests|verify|verification|validation|validate|check|acceptance|cite|citations?|evidence)\b/i.test(
        masked,
      );
    const checks = [
      { label: 'Outcome', present: hasOutcome, applicable: !shortTask },
      { label: 'Context', present: hasContext, applicable: !shortTask },
      { label: 'Boundaries', present: hasScope, applicable: complex },
      { label: 'Deliverable', present: hasFormat, applicable: complex },
      {
        label: 'Verification',
        present: hasVerification,
        applicable: complex && (task === 'coding' || task === 'research'),
      },
    ];
    if (words < 3)
      return {
        text,
        agent,
        goal,
        task,
        words,
        tokens: Math.ceil(text.length / 4),
        suggestions: [],
        checks,
        status: 'empty',
      };
    const neverAsk = /\b(?:do not|don't|never) ask (?:any )?(?:clarifying )?questions\b/i;
    if (
      neverAsk.test(masked) &&
      /(?:^|[.!?;\n])\s*(?:please )?ask (?:me )?(?:any )?clarifying questions\b/i.test(masked)
    ) {
      const match = masked.match(neverAsk);
      add({
        id: 'question-conflict',
        category: 'Consistency',
        priority: 0,
        title: 'Resolve the question policy',
        explanation:
          'This prompt both forbids questions and asks for clarification. Choose one policy so the agent knows when to pause.',
        kind: 'detail',
        start: match.index,
        end: match.index + match[0].length,
        original: text.slice(match.index, match.index + match[0].length),
        question: 'When may the agent ask a question?',
        placeholder: 'Ask only when missing information blocks the task.',
      });
    }
    const filler =
      /\b(?:I (?:just )?(?:want|would like) you to|Can you please|Could you please|Please kindly)\s+/i.exec(
        masked,
      );
    if (filler) {
      const fillerEnd = withinDraft(masked, text, filler.index, filler.index + filler[0].length);
      add({
        id: 'filler',
        category: 'Efficiency',
        priority: goal === 'tokens' ? 0 : 5,
        title: 'Start with the task',
        explanation:
          'This lead-in adds words without changing the request. Removing it keeps your instruction intact.',
        kind: 'replace',
        start: filler.index,
        end: fillerEnd,
        original: text.slice(filler.index, fillerEnd),
        replacement: '',
      });
    }
    const vague =
      /\b(?:user[- ]friendly|professional|beautiful|robust|amazing|nice|better|modern)\b/i.exec(
        masked,
      );
    if (vague && !shortTask && !['writing', 'summarizing', 'research', 'analysis'].includes(task))
      add({
        id: 'vague',
        category: 'Clarity',
        priority: 1,
        title: 'Make “' + vague[0] + '” observable',
        explanation:
          'A subjective adjective leaves room for guesses. Describe the behavior, appearance, or standard you actually want.',
        kind: 'detail',
        start: vague.index,
        end: vague.index + vague[0].length,
        original: text.slice(vague.index, vague.index + vague[0].length),
        question: 'What does “' + vague[0] + '” mean for this task?',
        placeholder:
          task === 'coding'
            ? 'For example: keyboard accessible, with clear empty and error states'
            : 'For example: concise sentences with a warm, direct tone',
      });
    if (task === 'coding' && complex && !hasOutcome)
      add({
        id: 'outcome',
        category: 'Direction',
        priority: 1,
        title: 'Define a successful result',
        explanation:
          'The task names something to make, but the outcome is still open. Give the agent one concrete result to work toward.',
        kind: 'detail',
        question: 'What must the finished result let someone do?',
        placeholder: 'For example: a user can create a task, set a due date, and mark it complete',
        prefix: '\n\nSuccess criteria: ',
      });
    if (software && !shortTask && !hasContext)
      add({
        id: 'context',
        category: 'Context',
        priority: 2,
        title: 'Add your project context',
        explanation:
          'Name the project or materials available to the agent. Skip this if they are already available in the conversation.',
        kind: 'detail',
        question: 'What project, stack, or materials should it use?',
        placeholder: 'For example: extend the existing React app; use its current components',
        prefix: '\n\nContext: ',
      });
    if (task === 'coding' && complex && !hasScope) {
      if (goal === 'fast')
        add({
          id: 'scope-fast',
          category: 'Focus',
          priority: 1,
          title: 'Define the smallest working version',
          explanation:
            'A speed-focused request benefits from one complete flow and a clear stopping point. This is an optional workflow instruction.',
          kind: 'detail',
          question: 'What must work in this first version, and what can wait?',
          placeholder: 'For example: only task creation and completion; postpone filters',
          prefix: '\n\nFirst deliverable: ',
        });
      else if (goal === 'depth')
        add({
          id: 'scope-depth',
          category: 'Scope',
          priority: 2,
          title: 'Set the boundaries for deep work',
          explanation:
            'Depth is most useful inside a clear scope. Specify what is included and what the agent should leave alone.',
          kind: 'detail',
          question: 'What is in scope, and what is excluded?',
          placeholder: 'For example: task creation and editing only; no accounts or payments',
          prefix: '\n\nScope: ',
        });
      else
        add({
          id: 'scope',
          category: 'Scope',
          priority: 3,
          title: 'Give the task a stopping point',
          explanation:
            'A boundary helps the agent avoid building adjacent features that you did not ask for.',
          kind: 'detail',
          question: 'What is the first deliverable or limit?',
          placeholder: 'For example: one working page; keep authentication out of scope',
          prefix: '\n\nScope: ',
        });
    }
    const noTests = /\b(?:skip|do not run|don't run|no) (?:the )?tests?\b/i.test(masked);
    if (complex && !hasVerification && !noTests && goal !== 'tokens' && software)
      add({
        id: 'verification',
        category: 'Verification',
        priority: goal === 'depth' ? 2 : 4,
        title: 'Say how to verify the work',
        explanation:
          'Ask for relevant checks and an honest account of anything unverified. This does not prescribe a particular test framework.',
        kind: 'append',
        replacement:
          '\n\nVerify the main flow and relevant edge cases. Run available checks appropriate to the changes, and report what remains unverified.',
      });
    const noCitations =
      /\b(?:no|without|skip|do not include|don't include) (?:external )?(?:sources|citations|references)\b|\b(?:do not|don't) cite\b/i.test(
        masked,
      );
    const hasCitations =
      /\b(?:cite|citations?|references|source links|link.{0,20}sources|sources.{0,20}links)\b/i.test(
        masked,
      );
    if (task === 'research' && !hasCitations && !noCitations)
      add({
        id: 'evidence',
        category: 'Evidence',
        priority: 2,
        title: 'Make the evidence reviewable',
        explanation:
          'Research is easier to evaluate when the agent identifies its sources and distinguishes facts from inference.',
        kind: 'append',
        replacement:
          '\n\nCite the sources behind material claims and distinguish supported facts from inference or uncertainty.',
      });
    if (software && complex && !hasFormat) {
      const replacement =
        goal === 'tokens'
          ? '\n\nKeep the final response concise: the result, essential evidence, and blockers only.'
          : goal === 'fast'
            ? '\n\nDeliver the working result with a short summary of changes and any blockers.'
            : task === 'coding'
              ? '\n\nDeliver the implementation, a concise change summary, and verification results.'
              : '\n\nReturn the fix, its cause, and verification results.';
      add({
        id: 'deliverable',
        category: goal === 'tokens' ? 'Efficiency' : 'Deliverable',
        priority: goal === 'tokens' ? 1 : 5,
        title:
          goal === 'tokens' ? 'Keep the response compact' : 'Specify what the agent should return',
        explanation:
          goal === 'tokens'
            ? 'A response-length instruction can reduce unnecessary narration. Actual token use depends on the agent and task.'
            : 'State what you want back so the agent knows when the job is complete.',
        kind: replacement ? 'append' : 'detail',
        replacement,
        question: 'What should the agent return?',
        placeholder: 'For example: a comparison table followed by a recommendation',
        prefix: '\n\nReturn: ',
      });
    }
    if (
      AGENTS[agent].coding &&
      software &&
      /\b(existing|repo|repository|codebase|project)\b/i.test(masked) &&
      !/\b(inspect|conventions|read.*files|examine|explore)\b/i.test(masked) &&
      goal !== 'tokens'
    )
      add({
        id: 'agent-project',
        category: 'Agent fit',
        priority: 3,
        title: 'Let the coding agent inspect first',
        explanation:
          'Ask the agent to inspect the existing repository before making changes, so it can use the actual files and dependencies.',
        kind: 'append',
        replacement:
          '\n\nInspect the relevant project files first. Follow existing conventions and preserve unrelated work.',
      });
    const hasMaterial =
      /\b(attached|provided|below|above|following|transcript|source material)\b/i.test(masked) ||
      /```\s*\S|["“][^"”\n]{8,}["”]|<(?:source|document|context)>/i.test(text);
    const hasAudience =
      /\b(?:audience|readers?|recipients?)\b|\b(?:for|to) (?:my |our |the |a |an )?(?:team|customers|clients|staff|employees|managers|students|beginners|developers|investors|board|parents|teachers)\b/i.test(
        masked,
      ) || /\b(?:email|message|letter)\s+to\s+\S+/i.test(masked);
    const detail = (id, title, question, placeholder, prefix, observation, source = 'clarity') => {
      add({
        id,
        title,
        question,
        placeholder,
        prefix: '\n\n' + prefix + ': ',
        explanation:
          'Add this if it is needed for your task. Skip it if the agent already has the information.',
        observation,
        category: source === 'context' ? 'Context' : 'Direction',
        priority: 1,
        kind: 'detail',
      });
    };
    // A small build ("write me a script to clean up my data") is under-specified in the same way a
    // large one is: nobody can run it without a language and without knowing what goes in and out.
    if (task === 'coding' && shortTask) {
      const hasLanguage =
        /\b(?:python|javascript|typescript|node(?:\.js)?|bash|shell|zsh|sh|sql|go(?:lang)?|rust|java|kotlin|swift|c\+\+|c#|ruby|php|perl|powershell|r|matlab|excel|vba|applescript)\b/i.test(
          masked,
        );
      // Either half counts: a named source, or a named result. Reuse the signals the rest of the
      // engine already uses, so a prompt that says "use the attached schema, return SQL only" is left alone.
      const namesFiles =
        /\b(?:csv|tsv|json|ya?ml|xml|xlsx?|spreadsheet|database|table|api|endpoint|url|folder|directory|file|files|log|logs|pdf|markdown|stdin|stdout)\b/i.test(
          masked,
        );
      const hasInputOutput = namesFiles || hasMaterial || hasContext || hasFormat;
      if (!hasLanguage)
        detail(
          'runtime',
          'Name the language or runtime',
          'Which language or tool should this run in?',
          'For example: Python 3 run from the command line',
          'Language',
          'No language or runtime was detected, so the agent has to guess one.',
        );
      if (!hasInputOutput)
        detail(
          'inputs-outputs',
          'State the inputs and the output',
          'What does it read, and what should it produce?',
          'For example: reads sales.csv and writes cleaned.csv, keeping the header row',
          'Inputs and output',
          'No input or output was named, so "done" cannot be checked.',
        );
    }
    if (
      task === 'debugging' &&
      !(
        (/\b(expected|should|supposed to)\b/i.test(masked) ||
          /(?:^|[.!?;\n])\s*(?:show|display|return|keep|leave|allow|prevent)\b[^.!?\n]{0,120}\binstead\b/i.test(
            masked,
          )) &&
        /\b(actual|instead|but|error|crash|fails?)\b/i.test(masked)
      )
    )
      detail(
        'failure',
        'Describe the failure',
        'What did you expect, what happened, and how can it be reproduced?',
        'For example: submitting an empty form crashes; it should show validation. Include the error and steps.',
        'Failure and reproduction',
        'A debugging request needs enough detail to reproduce the reported behavior.',
        'context',
      );
    if (task === 'research') {
      if (
        /\b(compare|comparison|best|recommend|choose|decide|options|evaluate)\b/i.test(masked) &&
        !/\b(criteria|prioriti[sz]e|based on|budget|cost|price|latency|accuracy|trade[- ]offs|decision criteria)\b/i.test(
          masked,
        )
      )
        detail(
          'research-criteria',
          'Define what the comparison is for',
          'What decision are you making, and what matters most?',
          'For example: choose a tool for a five-person team; compare cost, privacy, and setup effort',
          'Decision criteria',
          'The draft requests research or comparison without explicit comparison criteria.',
        );
      const timeSensitive =
        /\b(latest|current|today|recent|news|pricing|prices|best|up.to.date)\b/i.test(masked);
      if (
        timeSensitive &&
        !/\b(as of|accessed|published|publication|date range|updated on)\b|\b20\d\d\b/i.test(masked)
      )
        detail(
          'freshness',
          'Set the time period',
          'What dates or time period should the research cover?',
          'For example: information available as of 8 September 2026; include publication dates',
          'Research period',
          'This draft uses time-sensitive wording; a period makes the request reviewable.',
          'context',
        );
      if (!hasFormat)
        detail(
          'research-format',
          'Choose a useful research result',
          'What should the agent return?',
          'For example: a comparison table, source links, and a recommendation with trade-offs',
          'Return',
          'No explicit output format was detected for this research request.',
        );
    }
    const simpleTransformation =
      /\b(rewrite|rephrase|proofread|translate|correct|edit)\b/i.test(masked) && hasMaterial;
    const shortCreative = /\b(story|poem|haiku|joke|sonnet|fiction)\b/i.test(masked) && words < 35;
    // The priority control has to mean something here too: for writing and summaries, what changes
    // is how long the result should be and how much ground it should cover.
    if (['writing', 'summarizing'].includes(task) && !simpleTransformation && !shortCreative) {
      const hasLength =
        /\b(\d+\s*(?:words?|sentences?|paragraphs?|bullets?|pages?|lines?)|short|brief|concise|detailed|in depth|thorough|one page|a paragraph|a sentence)\b/i.test(
          masked,
        );
      if (!hasLength && goal !== 'balanced' && !(task === 'summarizing' && !hasFormat))
        add({
          id: 'length',
          category: goal === 'tokens' ? 'Efficiency' : 'Deliverable',
          priority: 2,
          title:
            goal === 'tokens'
              ? 'Set a length limit'
              : goal === 'fast'
                ? 'Ask for a first draft'
                : 'Say how much ground to cover',
          explanation:
            goal === 'tokens'
              ? 'A stated limit is the most reliable way to keep the answer short.'
              : goal === 'fast'
                ? 'Asking for a short draft first gives you something to react to before the full version.'
                : 'Saying what the result must cover is what makes a thorough answer thorough.',
          observation: 'No length or depth was stated, so the agent chooses one.',
          kind: 'append',
          replacement:
            goal === 'tokens'
              ? '\n\nKeep it under 150 words.'
              : goal === 'fast'
                ? '\n\nSend a short first draft I can react to before writing the full version.'
                : '\n\nCover each main point in its own short section, and say what you left out and why.',
        });
    }
    if (task === 'writing' && !simpleTransformation && !shortCreative) {
      if (!hasAudience)
        detail(
          'writing-audience',
          'Identify the reader',
          'Who will read this, and what do they already know?',
          'For example: existing customers who have not heard about the change',
          'Audience',
          'The draft asks for writing; no explicit audience wording was detected.',
          'context',
        );
      if (
        !/\b(announce|announcing|inform|explain|invite|ask|request|confirm|confirming|cancel|cancelling|canceling|decline|declining|convince|persuade|about|purpose|goal|so that)\b/i.test(
          masked,
        )
      )
        detail(
          'writing-purpose',
          'Give the message a purpose',
          'What should the reader know or do afterward?',
          'For example: ask the team to review the updated onboarding guide before Friday',
          'Message purpose',
          'The writing request does not give an explicit purpose or desired reader action.',
        );
      if (
        !hasMaterial &&
        !/\b(key facts|must include|fiction|fictional|invent|imagine|story|poem)\b|\b(?:include|details|facts)\s*:/i.test(
          masked,
        ) &&
        !/\b(?:confirm(?:ing)?|reschedul(?:e|ing)|cancel(?:ling|ing)?)\b[^.!?\n]{0,140}\b(?:meeting|appointment|booking|reservation)\b/i.test(
          masked,
        )
      )
        detail(
          'writing-facts',
          'Supply the facts to include',
          'Which facts, names, dates, or details must be included?',
          'Enter the facts you know. Leave unknown dates or claims out.',
          'Facts to include',
          'The reviewer cannot access facts from earlier messages or attachments.',
          'context',
        );
    }
    if (task === 'summarizing' || task === 'analysis') {
      if (
        !hasMaterial &&
        !/\b(?:use|using|from|in) (?:the |my |our )?(?:attached |provided )?(?:data|dataset|csv|spreadsheet|report|notes|document)\b/i.test(
          masked,
        )
      )
        detail(
          'source-material',
          'Identify the source material',
          'Which material should the agent use?',
          'For example: the attached report. Make sure it is available to the agent.',
          'Source material',
          'No explicit source reference was detected. This reviewer only sees the current textbox.',
          'context',
        );
      if (task === 'summarizing' && !hasFormat)
        detail(
          'summary-format',
          'Set the summary length',
          'What length or structure would make the summary useful?',
          'For example: five bullets covering decisions, action items, and unresolved questions',
          'Summary format',
          'A summary is requested without an explicit length or structure.',
        );
      if (task === 'analysis') {
        if (!hasFormat)
          detail(
            'analysis-format',
            'Choose how to present the findings',
            'What output will help you use the analysis?',
            'For example: a chart of the trend, the calculations, and a short explanation of uncertainty',
            'Return',
            'No explicit output format was detected for this analysis request.',
          );
        if (
          !/\b(question|determine|find|identify|why|whether|which|calculate|forecast|correlation|trend|compare|goal|objective)\b/i.test(
            masked,
          )
        )
          detail(
            'analysis-question',
            'State the question for the data',
            'What question should this analysis answer?',
            'For example: which region contributed most to the quarterly revenue change?',
            'Analysis question',
            'The draft asks for data analysis without an explicit analytical question.',
          );
        if (
          !/\b(missing|units|definitions|assumptions|duplicates|null|cleaning|data quality)\b/i.test(
            masked,
          )
        )
          detail(
            'data-definitions',
            'Clarify the data conventions',
            'Which units, definitions, or missing-value rules matter?',
            'For example: revenue is in INR; blank values are unknown, not zero',
            'Data conventions',
            'Units and missing values can change the interpretation of data.',
            'context',
          );
      }
    }
    const repeats = new Map();
    for (const match of masked.matchAll(/[^.!?\n]+[.!?]?/g)) {
      // Source masking can make distinct quoted values look identical. Compare
      // literal source text, and decline cleanup across any masked material.
      const original = text.slice(match.index, match.index + match[0].length);
      if (original !== match[0]) continue;
      const key = original.trim();
      if (key.split(/\s+/).length < 4) continue;
      if (repeats.has(key)) {
        const leading = match[0].length - match[0].trimStart().length;
        add({
          id: 'repeat-' + match.index,
          category: 'Efficiency',
          priority: 0,
          title: 'Remove the repeated instruction',
          explanation: 'This sentence repeats an earlier instruction verbatim. Keep one copy.',
          kind: 'replace',
          start: match.index + leading,
          end: match.index + match[0].length,
          original: text.slice(match.index + leading, match.index + match[0].length),
          replacement: '',
        });
      }
      repeats.set(key, true);
    }
    // A maximum of six ranked suggestions keeps feedback proportional to the task.
    const rank = (s) => {
      if (goal === 'tokens' && /format$/.test(s.id)) return 0;
      if (goal === 'fast' && /criteria|purpose|analysis-question|failure/.test(s.id)) return 0;
      if (goal === 'depth' && /evidence|data-definitions|failure/.test(s.id)) return 0;
      return s.priority;
    };
    suggestions.sort((a, b) => rank(a) - rank(b));
    return {
      text,
      agent,
      goal,
      task,
      words,
      tokens: Math.ceil(text.length / 4),
      suggestions: suggestions.slice(0, 6),
      referencesPriorContext,
      checks,
      status: 'ready',
    };
  }
  function editFor(text, suggestion, detail = '') {
    const isRange = Number.isInteger(suggestion.start);
    const replacement =
      suggestion.kind === 'detail'
        ? isRange
          ? detail.trim()
          : (suggestion.prefix || '\n\n') + detail.trim()
        : suggestion.replacement;
    if (suggestion.kind === 'detail' && !detail.trim())
      throw new Error('Add your detail before applying this suggestion.');
    return {
      start: isRange ? suggestion.start : text.length,
      end: isRange ? suggestion.end : text.length,
      replacement,
      expected: isRange ? suggestion.original : '',
    };
  }
  function applyEdit(text, edit) {
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > text.length ||
      text.slice(edit.start, edit.end) !== edit.expected
    )
      throw new Error('The text changed. Review fresh suggestions.');
    return text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  }
  // Apply only explicitly selected suggestions. All ranges refer to the same
  // immutable source; apply from right to left and reject overlapping edits.
  function buildPreview(base, suggestions, selected, details = new Map()) {
    const chosen = suggestions.filter((s) => selected.has(s.key));
    const ready = chosen.filter((s) => s.kind !== 'detail' || details.get(s.key)?.trim());
    let text = base;
    let previousStart = Infinity;
    for (const s of ready
      .filter((s) => Number.isInteger(s.start))
      .sort((a, b) => b.start - a.start)) {
      if (s.end > previousStart)
        throw new Error('Two selected changes overlap. Include one at a time.');
      text = applyEdit(text, editFor(base, s, details.get(s.key) || ''));
      previousStart = s.start;
    }
    for (const s of ready.filter((s) => !Number.isInteger(s.start))) {
      text += editFor(base, s, details.get(s.key) || '').replacement;
    }
    return {
      base,
      text,
      applied: ready.length,
      missing: suggestions.filter((s) => s.kind === 'detail' && !details.get(s.key)?.trim()).length,
    };
  }
  function compareText(before, after) {
    const words = (text) => (text.trim().match(/\S+/g) || []).length;
    return {
      beforeWords: words(before),
      afterWords: words(after),
      beforeTokens: Math.ceil(before.length / 4),
      afterTokens: Math.ceil(after.length / 4),
      changed: before !== after,
    };
  }
  const api = {
    AGENTS,
    GOALS,
    TASKS,
    SOURCES,
    REVIEWED_ON,
    profileNote,
    analyze,
    editFor,
    applyEdit,
    detectAgent,
    instructionText,
    buildPreview,
    compareText,
  };
  root.PromptlineEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
