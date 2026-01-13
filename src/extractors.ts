import { Node } from "ts-morph";

type StringExtractor = (node: Node) => string[] | null;

function extractFromStringLiteral(node: Node): string[] | null {
	if (!Node.isStringLiteral(node)) return null;
	return [node.getLiteralValue()];
}

function extractFromTemplateLiteral(node: Node): string[] | null {
	if (!Node.isNoSubstitutionTemplateLiteral(node)) return null;
	return [node.getLiteralValue()];
}

function extractFromTemplateExpression(node: Node): string[] | null {
	if (!Node.isTemplateExpression(node)) return null;

	const head = node.getHead().getText().slice(1, -2);
	const spans = node.getTemplateSpans();

	let pattern = head;
	for (const span of spans) {
		const expr = span.getExpression();
		const varName = Node.isIdentifier(expr) ? expr.getText() : "param";
		pattern += `{${varName}}`;

		const literal = span.getLiteral();
		const literalText = literal.getText();
		const cleanText = literalText.startsWith("}")
			? literalText.slice(1, literalText.endsWith("`") ? -1 : -2)
			: literalText;
		pattern += cleanText;
	}

	return [pattern];
}

function extractFromConditionalExpression(node: Node): string[] | null {
	if (!Node.isConditionalExpression(node)) return null;
	return [
		...extractStringLiterals(node.getWhenTrue()),
		...extractStringLiterals(node.getWhenFalse()),
	];
}

function extractFromIdentifier(node: Node): string[] | null {
	if (!Node.isIdentifier(node)) return null;

	const results: string[] = [];
	for (const def of node.getDefinitionNodes()) {
		if (Node.isVariableDeclaration(def) || Node.isParameterDeclaration(def)) {
			const initializer = def.getInitializer();
			if (initializer) {
				results.push(...extractStringLiterals(initializer));
			}
		}
	}
	return results;
}

function extractFromParenthesizedExpression(node: Node): string[] | null {
	if (!Node.isParenthesizedExpression(node)) return null;
	return extractStringLiterals(node.getExpression());
}

function extractFromAsExpression(node: Node): string[] | null {
	if (!Node.isAsExpression(node)) return null;
	return extractStringLiterals(node.getExpression());
}

const stringLiteralExtractors: StringExtractor[] = [
	extractFromStringLiteral,
	extractFromTemplateLiteral,
	extractFromTemplateExpression,
	extractFromConditionalExpression,
	extractFromIdentifier,
	extractFromParenthesizedExpression,
	extractFromAsExpression,
];

/**
 * ASTノードから文字列リテラルを抽出する
 * テンプレートリテラル、三項演算子、変数参照などに対応
 * @param node - 解析対象のASTノード
 * @returns 抽出された文字列リテラルの配列
 */
export function extractStringLiterals(node: Node): string[] {
	for (const extractor of stringLiteralExtractors) {
		const result = extractor(node);
		if (result !== null) {
			return result;
		}
	}
	return [];
}
