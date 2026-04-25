"use client";

/**
 * Renders a structured table for II-DAT and EI-SYN questions.
 * The `table_json` column on a question row has the shape:
 *   { caption: string, columns: string[], rows: (string | number)[][] }
 * Legacy archive rows have table_json = null and this component simply
 * doesn't render.
 */

export type QuestionTableData = {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
};

export default function QuestionTable({ table }: { table: QuestionTableData | null | undefined }) {
  if (!table) return null;
  return (
    <figure className="my-4 overflow-x-auto">
      <figcaption className="mb-2 text-center text-sm font-medium text-gray-700">
        {table.caption}
      </figcaption>
      <table className="mx-auto border-collapse text-sm">
        <thead>
          <tr>
            {table.columns.map((col, i) => (
              <th
                key={i}
                className="border border-gray-300 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-900"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border border-gray-300 px-3 py-2 text-gray-800"
                >
                  {String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
