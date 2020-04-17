import { NoteGroup } from 'Components/Types';
import makeKey from 'utils/makeKey';

export default function placeholderNoteGroups(): NoteGroup[] {
  return [
    {
      key: makeKey(16),
      title: 'General',
      notes: [
        {
          key: makeKey(32),
          type: 'list',
          content: 'Lorem ipsum',
          icon: 'mdi:hammer',
        },
        {
          key: makeKey(32),
          type: 'list',
          content:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus viverra tellus turpis, quis pharetra ligula mollis vel.',
          icon: 'mdi:hammer',
        },
      ],
    },
    {
      key: makeKey(16),
      title: 'TODO',
      notes: [
        {
          key: makeKey(32),
          type: 'task',
          content: 'Add some items',
        },
      ],
    },
  ];
}
