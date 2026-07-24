const csv = require('csv-parser');
const fs = require('fs');

fs.writeFileSync('test.csv', `ID_Personal;DNI;Nombre;Apellido;Horario;PeriodoInicio;PeriodoFin
10001;11111111;Juan;Perez;Guardia 24h;1/5/2026;30/6/2026
10002;22222222;Maria;Gomez;Guardia 12h;1/5/2026;30/6/2026
`);

const results = [];
fs.createReadStream('test.csv')
  .pipe(csv({ separator: ';', mapHeaders: ({ header }) => header.toLowerCase().trim() }))
  .on('data', (data) => results.push(data))
  .on('end', () => {
    console.log(results);
    let importedCount = 0;
    for (const row of results) {
      const idPersonal = row['id_personal'];
      const dni = row['dni'];
      const nombre = row['nombre'];
      const apellido = row['apellido'];
      const horario = row['horario'];
      const periodoInicio = row['periodoinicio'];
      const periodoFin = row['periodofin'];
      
      console.log({dni, nombre, apellido, horario, periodoInicio, periodoFin});
      if (!dni || !nombre || !apellido || !horario || !periodoInicio || !periodoFin) {
          console.log("SKIPPED", dni);
         continue; // Saltar filas inválidas
      }
      importedCount++;
    }
    console.log("Imported:", importedCount);
  });
