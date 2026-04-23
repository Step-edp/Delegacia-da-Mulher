const pool = require('../config/database');

function normalizeComparableBoNumber(value) {
  let normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Remove common prefixes like "BO", "BOLETIM", "RDO", etc.
  normalized = normalized
    .replace(/^BO(?=[A-Z0-9])/, '')
    .replace(/^RDO(?=[A-Z0-9])/, '')
    .replace(/^BOLETIM(?=[A-Z0-9])/, '');
  
  return normalized;
}

async function findPendingExpectedCaseByBoNumber(boNumber) {
  const normalizedBoNumber = normalizeComparableBoNumber(boNumber);

  if (!normalizedBoNumber) {
    return null;
  }

  const query = `
    SELECT
      id,
      daily_import_id AS "dailyImportId",
      status,
      bo_number AS "boNumber",
      natureza,
      victim_name AS "victimName",
      author_name AS "authorName",
      created_at AS "createdAt"
    FROM expected_cases
    WHERE REGEXP_REPLACE(
      REGEXP_REPLACE(
        UPPER(COALESCE(bo_number, '')),
        '^BO(?=[A-Z0-9])',
        ''
      ),
      '[^A-Z0-9]',
      '',
      'g'
    ) = $1
      AND status = 'PENDENTE'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [normalizedBoNumber]);
  return rows[0] || null;
}

async function linkPairToExpectedCase({ expectedCaseId, boFile, extratoFile, boData, extratoData }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateCaseQuery = `
      UPDATE expected_cases
      SET status = 'PROCESSANDO'
      WHERE id = $1
        AND status = 'PENDENTE'
      RETURNING
        id,
        status,
        bo_number AS "boNumber",
        natureza,
        victim_name AS "victimName",
        author_name AS "authorName"
    `;

    const updatedCaseResult = await client.query(updateCaseQuery, [expectedCaseId]);
    const updatedCase = updatedCaseResult.rows[0];

    if (!updatedCase) {
      const error = new Error('Caso esperado nao esta mais com status PENDENTE.');
      error.statusCode = 409;
      throw error;
    }

    const insertPairQuery = `
      INSERT INTO case_pdf_pairs (
        expected_case_id,
        bo_file_name,
        bo_file_path,
        extrato_file_name,
        extrato_file_path,
        extracted_bo_data,
        extracted_extrato_data
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      RETURNING
        id,
        expected_case_id AS "expectedCaseId",
        bo_file_name AS "boFileName",
        bo_file_path AS "boFilePath",
        extrato_file_name AS "extratoFileName",
        extrato_file_path AS "extratoFilePath",
        created_at AS "createdAt"
    `;

    const insertValues = [
      expectedCaseId,
      boFile.originalname,
      boFile.path,
      extratoFile.originalname,
      extratoFile.path,
      JSON.stringify(boData),
      JSON.stringify(extratoData)
    ];

    const pairResult = await client.query(insertPairQuery, insertValues);

    await client.query('COMMIT');

    return {
      expectedCase: updatedCase,
      pair: pairResult.rows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      const conflictError = new Error('Este caso esperado ja possui par BO + Extrato vinculado.');
      conflictError.statusCode = 409;
      throw conflictError;
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findPendingExpectedCaseByBoNumber,
  linkPairToExpectedCase
};
