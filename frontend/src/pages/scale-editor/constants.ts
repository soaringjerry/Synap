export const LIKERT_PRESETS: Record<string, { en: string[]; zh: string[] }> = {
  numeric: { en: ['1', '2', '3', '4', '5'], zh: ['1', '2', '3', '4', '5'] },
  agree5: {
    en: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
    zh: ['非常不同意', '不同意', '中立', '同意', '非常同意'],
  },
  freq5: {
    en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
    zh: ['从不', '很少', '有时', '经常', '总是'],
  },
  agree7: {
    en: [
      'Strongly disagree',
      'Disagree',
      'Somewhat disagree',
      'Neutral',
      'Somewhat agree',
      'Agree',
      'Strongly agree',
    ],
    zh: ['非常不同意', '不同意', '有点不同意', '中立', '有点同意', '同意', '非常同意'],
  },
  bipolar7: {
    en: [
      'Extremely negative',
      'Very negative',
      'Slightly negative',
      'Neutral',
      'Slightly positive',
      'Very positive',
      'Extremely positive',
    ],
    zh: ['非常负向', '很负向', '略为负向', '中立', '略为正向', '很正向', '非常正向'],
  },
  mono5: {
    en: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Extremely'],
    zh: ['完全没有', '稍微', '中等', '非常', '极其'],
  },
}
