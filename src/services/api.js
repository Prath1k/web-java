export const executeJavaCode = async (sourceCode) => {
  const createUrl = '/api-paiza/runners/create.json';
  const detailsUrl = '/api-paiza/runners/get_details.json';

  try {
    const createParams = new URLSearchParams({
      source_code: sourceCode,
      language: 'java',
      api_key: 'guest'
    });

    const createResponse = await fetch(`${createUrl}?${createParams.toString()}`, {
      method: 'POST'
    });

    if (!createResponse.ok) {
      throw new Error(`HTTP error during creation! status: ${createResponse.status}`);
    }

    const createData = await createResponse.json();
    const id = createData.id;

    if (!id) {
      throw new Error('Failed to create execution session (no ID returned).');
    }

    // Polling get_details until status is completed
    let status = createData.status;
    let detailsData = null;
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 500ms = 15 seconds

    while (status !== 'completed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;

      const detailsParams = new URLSearchParams({
        id: id,
        api_key: 'guest'
      });

      const detailsResponse = await fetch(`${detailsUrl}?${detailsParams.toString()}`);
      if (!detailsResponse.ok) {
        throw new Error(`HTTP error during polling! status: ${detailsResponse.status}`);
      }

      detailsData = await detailsResponse.json();
      status = detailsData.status;
    }

    if (attempts >= maxAttempts && status !== 'completed') {
      throw new Error('Execution timed out.');
    }

    if (!detailsData) {
      throw new Error('Failed to retrieve execution details.');
    }

    // Process detailsData output
    // If there's a build/compilation error:
    if (detailsData.build_result === 'failure') {
      return {
        error: true,
        output: detailsData.build_stderr || detailsData.build_stdout || 'Compilation failed.'
      };
    }

    // If there's a runtime error:
    if (detailsData.result === 'failure') {
      return {
        error: true,
        output: detailsData.stderr || detailsData.stdout || 'Runtime execution failed.'
      };
    }

    // Successful execution
    const output = detailsData.stdout || '';
    const errorOutput = detailsData.stderr || '';
    
    return {
      error: !!errorOutput,
      output: output + (errorOutput ? `\nErrors:\n${errorOutput}` : '')
    };

  } catch (error) {
    return { error: true, output: `Network or API Error: ${error.message}` };
  }
};
