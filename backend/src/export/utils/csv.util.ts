import { Logger } from '@nestjs/common';

export class CsvUtil {
  private static readonly logger = new Logger(CsvUtil.name);

  static toCsv<T extends Record<string, any>>(data: T[]): string {
    if (!data || data.length === 0) {
      this.logger.warn('CSV conversion attempted with no data.');
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    for (const row of data) {
      const values = headers.map((header) => {
        const value = row[header];
        return this.escapeCsvField(value);
      });
      csvRows.push(values.join(','));
    }

    this.logger.log(`Successfully converted ${data.length} rows to CSV format.`);
    return csvRows.join('\n');
  }

  private static escapeCsvField(field: any): string {
    if (field === null || field === undefined) {
      return '';
    }

    let stringField = String(field);

    if (
      stringField.includes(',') ||
      stringField.includes('"') ||
      stringField.includes('\n')
    ) {
      stringField = `"${stringField.replace(/"/g, '""')}"`;
    }

    return stringField;
  }
}