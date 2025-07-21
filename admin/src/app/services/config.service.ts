import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Country } from '../models/user.model';
@Injectable({
  providedIn: 'root'
})
export class ConfigService {

  constructor(private http: HttpClient) {}


  getCountries(): Observable<Country[]> {
    return this.http.get<Country[]>('assets/term/country.json');
  }

}
