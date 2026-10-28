import classNames from 'classnames';

interface Args {
  index: number;
  options: string;
  answer: string;
  onOptionClick: (option: string, index: number) => void;
}

/** One question row: the number and one bubble per option. Clicking the chosen bubble again clears it. */
const AnswerInput = ({ index, options, answer, onOptionClick }: Args) => (
  <div className="flex items-center gap-1.5 text-sm">
    <div className="w-7 text-right pr-1 text-gray-700">{index}.</div>
    {options.split('').map(opt => (
      <button
        type="button"
        key={opt}
        aria-label={`Question ${index} option ${opt}`}
        aria-pressed={answer === opt}
        onClick={() => onOptionClick(answer === opt ? '' : opt, index)}
        className={classNames('w-6 h-6 text-xs rounded-full border-2 border-black leading-none',
          { 'bg-[#35C06FA0] font-semibold': answer === opt, 'bg-gray-100 hover:bg-gray-200': answer !== opt })}
      >{opt}</button>
    ))}
  </div>
);

export default AnswerInput;
