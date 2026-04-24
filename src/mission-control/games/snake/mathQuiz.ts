export interface QuizQuestion {
    text: string;
    answer: number;
}

export function generateAdditionQuestion(maxSum: number = 20): QuizQuestion {
    // Generate two numbers that sum up to at most maxSum
    const a = Math.floor(Math.random() * (maxSum - 1)) + 1;
    const b = Math.floor(Math.random() * (maxSum - a)) + 1;

    return {
        text: `${a} + ${b} = ?`,
        answer: a + b
    };
}
